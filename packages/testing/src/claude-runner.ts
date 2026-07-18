import { isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveClaudeRunnerAuth, type ResolvedClaudeAuth } from './auth.js';
import { isolatedEnvironment, type IsolationLayout } from './isolation.js';
import { runProcess } from './process.js';
import type { AgentRunRequest, AgentRunResult, AgentRunner, RunnerDetection } from './types.js';

const REQUIRED_FLAGS = [
  '--print', '--output-format', '--bare', '--no-session-persistence', '--strict-mcp-config',
  '--mcp-config', '--tools', '--settings', '--model', '--permission-mode',
];
const MINIMUM_SANDBOX_VERSION = [2, 1, 187] as const;

export interface ClaudeRunnerOptions {
  command?: string;
  commandArgs?: string[];
  maxOutputBytes?: number;
  platform?: NodeJS.Platform;
  authEnvironment?: NodeJS.ProcessEnv;
}

export class ClaudeRunner implements AgentRunner {
  readonly id = 'claude';
  private detection?: RunnerDetection;

  constructor(private readonly options: ClaudeRunnerOptions = {}) {}

  resolveAuth() { return resolveClaudeRunnerAuth(this.options.authEnvironment); }

  async detect(): Promise<RunnerDetection> {
    if (this.detection) return this.detection;
    const platform = this.options.platform || process.platform;
    if (platform !== 'darwin' && platform !== 'linux') {
      return this.detection = {
        available: false,
        capabilities: [],
        reason: 'Claude runner requires macOS, Linux, or WSL2 because Claude Code sandboxing is unavailable on native Windows',
      };
    }
    try {
      const environment = detectionEnvironment();
      const versionResult = await this.invoke(['--version'], 10_000, { env: environment });
      if (versionResult.code !== 0) throw new Error(versionResult.stderr || `claude --version exited ${versionResult.code}`);
      const version = versionResult.stdout.trim();
      const parsedVersion = parseVersion(version);
      if (!parsedVersion || compareVersion(parsedVersion, MINIMUM_SANDBOX_VERSION) < 0) {
        return this.detection = {
          available: false,
          version,
          capabilities: [],
          reason: `Claude runner requires Claude Code 2.1.187 or newer for credential filtering; detected ${version || 'unknown'}`,
        };
      }
      const helpResult = await this.invoke(['--help'], 10_000, { env: environment });
      if (helpResult.code !== 0) throw new Error(helpResult.stderr || `claude --help exited ${helpResult.code}`);
      const missing = REQUIRED_FLAGS.filter((flag) => !helpResult.stdout.includes(flag));
      if (missing.length) {
        return this.detection = {
          available: false,
          version,
          capabilities: [],
          reason: `Claude Code does not advertise required flags: ${missing.join(', ')}`,
        };
      }
      return this.detection = {
        available: true,
        version,
        capabilities: [
          'isolated home directories', 'environment filtering', 'network deny', 'network allow',
          'web search disabled', 'strict sandbox validation', 'resolved model reporting', 'json events',
          'explicit skill prompt injection',
        ],
      };
    } catch (error) {
      return this.detection = { available: false, capabilities: [], reason: (error as Error).message };
    }
  }

  async preflight(policies: AgentRunRequest['network'][]): Promise<void> {
    const detection = await this.detect();
    if (!detection.available) throw new Error(detection.reason || 'Claude runner unavailable');
    if (!policies.length) throw new Error('Claude runner requires an explicit network policy');
    const unsupported = policies.find((policy) => policy.webSearch !== 'disabled');
    if (unsupported) {
      throw new Error(`Claude runner supports webSearch: disabled only; received ${unsupported.webSearch}`);
    }
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const started = Date.now();
    const auth = claudeAuth(request);
    const detection = await this.detect();
    if (!detection.available) throw new Error(detection.reason || 'Claude runner unavailable');
    if (request.network.webSearch !== 'disabled') {
      return incompleteResult(request, started, `Claude runner does not support webSearch: ${request.network.webSearch}`);
    }
    const layout = layoutFromRequest(request);
    const settings = buildSettings(request);
    const args = [
      '--print', '--output-format', 'stream-json', '--verbose', '--bare', '--no-session-persistence',
      '--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: {} }),
      '--tools', 'Bash,Read,Edit,Write,Glob,Grep', '--permission-mode', 'acceptEdits',
      '--settings', JSON.stringify(settings),
    ];
    if (request.requestedModel) args.push('--model', request.requestedModel);
    const environment = {
      ...isolatedEnvironment(layout),
      ANTHROPIC_API_KEY: auth.apiKey,
      CLAUDE_CONFIG_DIR: layout.claudeHome,
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
      CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
      DISABLE_AUTOUPDATER: '1',
      DISABLE_FEEDBACK_COMMAND: '1',
      DISABLE_ERROR_REPORTING: '1',
      DISABLE_TELEMETRY: '1',
      DISABLE_BUG_COMMAND: '1',
    };
    const processResult = await this.invoke(args, request.timeoutMs, {
      cwd: request.workspace,
      env: environment,
      input: promptForRequest(request),
      maxOutputBytes: this.options.maxOutputBytes,
      knownSecrets: request.auth.knownSecrets,
    });
    const parsed = parseClaudeJsonl(processResult.stdout, processResult.truncated);
    const exitError = processResult.code === 0 ? undefined : processResult.stderr.trim() || `Claude exited with code ${processResult.code}`;
    const error = processResult.timedOut
      ? 'Claude execution timed out'
      : processResult.truncated
        ? parsed.error
        : exitError || parsed.error;
    return {
      ok: !error && parsed.completed,
      exitCode: processResult.code,
      durationMs: Date.now() - started,
      tokens: parsed.tokenUsage?.total,
      tokenUsage: parsed.tokenUsage,
      requestedModel: request.requestedModel || null,
      resolvedModel: parsed.resolvedModel,
      output: processResult.stdout,
      stderr: processResult.stderr,
      error,
      timedOut: processResult.timedOut,
      incomplete: !parsed.completed || Boolean(error),
      outputTruncated: processResult.truncated,
    };
  }

  private invoke(
    args: string[],
    timeoutMs: number,
    options: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      input?: string;
      maxOutputBytes?: number;
      knownSecrets?: Record<string, string | undefined>;
    } = {},
  ) {
    return runProcess(this.options.command || 'claude', [...(this.options.commandArgs || []), ...args], {
      timeoutMs,
      cwd: options.cwd,
      env: options.env || process.env,
      input: options.input,
      maxOutputBytes: options.maxOutputBytes,
      knownSecrets: options.knownSecrets,
    });
  }
}

function buildSettings(request: AgentRunRequest): Record<string, unknown> {
  const originalHomes = [process.env.HOME, process.env.USERPROFILE, process.env.XDG_CONFIG_HOME, process.env.XDG_DATA_HOME, process.env.XDG_CACHE_HOME]
    .filter((path): path is string => Boolean(path) && isAbsolute(path!))
    .filter((path) => !isInside(request.isolationRoot, path));
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      excludedCommands: [],
      filesystem: { denyRead: [...new Set(originalHomes)] },
      credentials: {
        envVars: [
          { name: 'ANTHROPIC_API_KEY', mode: 'deny' },
          { name: 'ANTHROPIC_AUTH_TOKEN', mode: 'deny' },
        ],
      },
      network: request.network.mode === 'deny'
        ? { allowedDomains: [], deniedDomains: ['*'] }
        : { allowedDomains: ['*'], deniedDomains: [] },
    },
    permissions: { deny: ['WebFetch', 'WebSearch'] },
    disableAllHooks: true,
    attribution: { commit: '', pr: '', sessionUrl: false },
  };
}

function detectionEnvironment(): NodeJS.ProcessEnv {
  const temporary = tmpdir();
  return {
    PATH: process.env.PATH,
    Path: process.env.Path,
    PATHEXT: process.env.PATHEXT,
    SYSTEMROOT: process.env.SYSTEMROOT,
    COMSPEC: process.env.COMSPEC,
    TEMP: temporary,
    TMP: temporary,
    HOME: temporary,
    USERPROFILE: temporary,
    XDG_CONFIG_HOME: temporary,
    XDG_DATA_HOME: temporary,
    XDG_CACHE_HOME: temporary,
    CLAUDE_CONFIG_DIR: join(temporary, 'leogriel-claude-detection'),
    CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
  };
}

function promptForRequest(request: AgentRunRequest): string {
  if (!request.skill) return request.prompt;
  return [
    'A Leogriel behavioral test is evaluating the Agent Skill below.',
    `Read and follow the instructions in ${JSON.stringify(join(request.skill.path, 'SKILL.md'))} before completing the task.`,
    'Treat that directory as the root for any references or assets mentioned by the skill.',
    '',
    request.prompt,
  ].join('\n');
}

function claudeAuth(request: AgentRunRequest): ResolvedClaudeAuth {
  if (request.auth.runner !== 'claude') throw new Error(`Claude runner received authentication for ${request.auth.runner}`);
  const auth = request.auth.payload as Partial<ResolvedClaudeAuth> | undefined;
  if (!auth || auth.mode !== 'api-key' || typeof auth.apiKey !== 'string') throw new Error('Claude runner received invalid authentication context');
  return auth as ResolvedClaudeAuth;
}

function layoutFromRequest(request: AgentRunRequest): IsolationLayout {
  const child = (name: string) => join(request.isolationRoot, name);
  return {
    root: request.isolationRoot,
    workspace: request.workspace,
    home: child('home'),
    userprofile: child('userprofile'),
    xdgConfig: child('xdg-config'),
    xdgData: child('xdg-data'),
    xdgCache: child('xdg-cache'),
    codexHome: child('codex-home'),
    claudeHome: child('claude-home'),
    temp: child('temp'),
    tmp: child('tmp'),
  };
}

function incompleteResult(request: AgentRunRequest, started: number, error: string): AgentRunResult {
  return {
    ok: false,
    exitCode: null,
    durationMs: Date.now() - started,
    requestedModel: request.requestedModel || null,
    output: '',
    stderr: '',
    error,
    incomplete: true,
  };
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

interface ParsedClaudeOutput {
  completed: boolean;
  error?: string;
  resolvedModel?: string;
  finalMessage?: string;
  tokenUsage?: NonNullable<AgentRunResult['tokenUsage']>;
}

export function parseClaudeJsonl(output: string, truncated = false): ParsedClaudeOutput {
  if (truncated) return { completed: false, error: 'Claude JSONL output exceeded the configured limit' };
  const lines = output.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { completed: false, error: 'Claude produced no JSONL events' };
  const events: Record<string, unknown>[] = [];
  for (const [index, line] of lines.entries()) {
    try {
      const event = JSON.parse(line) as unknown;
      if (!event || typeof event !== 'object' || Array.isArray(event) || typeof (event as Record<string, unknown>).type !== 'string') {
        throw new Error('event must be an object with type');
      }
      events.push(event as Record<string, unknown>);
    } catch (error) {
      return { completed: false, error: `Invalid Claude JSONL at line ${index + 1}: ${(error as Error).message}` };
    }
  }
  const started = events.some((event) => event.type === 'system' && event.subtype === 'init');
  const terminal = [...events].reverse().find((event) => event.type === 'result');
  if (!started || !terminal) return { completed: false, error: 'Claude JSONL is missing required init or result events' };
  if (terminal.is_error === true || terminal.subtype !== 'success') {
    return { completed: false, error: stringValue(terminal.result) || stringValue(terminal.error) || 'Claude result reported an error' };
  }
  const resolvedModel = events.map(findModel).find(Boolean);
  return {
    completed: true,
    resolvedModel,
    finalMessage: stringValue(terminal.result),
    tokenUsage: parseUsage(terminal.usage),
  };
}

function parseUsage(value: unknown): NonNullable<AgentRunResult['tokenUsage']> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const input = numeric(usage.input_tokens);
  const cachedInput = numeric(usage.cache_read_input_tokens);
  const output = numeric(usage.output_tokens);
  const reasoning = numeric(usage.reasoning_tokens);
  const suppliedTotal = numeric(usage.total_tokens);
  return { input, cachedInput, output, reasoning, total: suppliedTotal || input + output + reasoning };
}

function findModel(event: Record<string, unknown>): string | undefined {
  if (typeof event.model === 'string') return event.model;
  if (event.message && typeof event.message === 'object' && !Array.isArray(event.message)) {
    return findModel(event.message as Record<string, unknown>);
  }
  if (event.modelUsage && typeof event.modelUsage === 'object' && !Array.isArray(event.modelUsage)) {
    return Object.keys(event.modelUsage as Record<string, unknown>)[0];
  }
  return undefined;
}

function parseVersion(value: string): readonly [number, number, number] | undefined {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
