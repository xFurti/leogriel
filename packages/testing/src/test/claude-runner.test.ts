import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ClaudeRunner, createIsolation, destroyIsolation, parseClaudeJsonl, runSkillTests, validateTestFile,
  type AgentRunRequest,
} from '../index.js';

const REQUIRED_HELP = '--print --output-format --bare --no-session-persistence --strict-mcp-config --mcp-config --tools --settings --model --permission-mode';
const SECRET = 'anthropic-secret-abcdefghijklmnop';

test('Claude detection requires a current CLI and a sandbox-capable platform', async () => {
  const valid = await fakeClaude('valid');
  const old = await fakeClaude('old-version');
  const missing = await fakeClaude('missing-flags');
  try {
    const detected = await valid.runner.detect();
    assert.equal(detected.available, true);
    assert.match(detected.version || '', /2\.1\.200/);
    assert.ok(detected.capabilities.includes('network deny'));
    assert.match((await old.runner.detect()).reason || '', /2\.1\.187 or newer/);
    assert.match((await missing.runner.detect()).reason || '', /does not advertise required flags/);
    const windows = new ClaudeRunner({ command: process.execPath, commandArgs: [valid.script], platform: 'win32' });
    assert.match((await windows.detect()).reason || '', /native Windows/);
  } finally { await Promise.all([valid.cleanup(), old.cleanup(), missing.cleanup()]); }
});

test('Claude run uses stdin, bare mode, fail-closed sandboxing, and credential filtering', async () => {
  const fixture = await fakeClaude('valid');
  const isolation = await createIsolation();
  const skill = join(isolation.workspace, '.claude', 'skills', 'demo');
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: test\n---\nfollow me');
  try {
    const input = request(isolation, 'create output.txt');
    input.skill = { name: 'demo', path: skill };
    const result = await fixture.runner.run(input);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.resolvedModel, 'claude-test-model');
    assert.deepEqual(result.tokenUsage, { input: 9, cachedInput: 4, output: 3, reasoning: 0, total: 12 });
    const record = JSON.parse(await readFile(join(fixture.root, 'record.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(record.parentKey, true);
    assert.equal(record.childKey, false);
    assert.equal(record.nodeFound, true);
    assert.equal(record.claudeHome, isolation.claudeHome);
    assert.match(String(record.prompt), /\.claude.*skills.*demo.*SKILL\.md/);
    assert.match(String(record.prompt), /create output\.txt/);
    assert.match(String(record.arguments), /--bare/);
    assert.match(String(record.arguments), /--no-session-persistence/);
    assert.doesNotMatch(String(record.arguments), new RegExp(SECRET));
    assert.equal((record.settings as Record<string, unknown>).disableAllHooks, true);
    const sandbox = (record.settings as { sandbox: Record<string, unknown> }).sandbox;
    assert.equal(sandbox.failIfUnavailable, true);
    assert.equal(sandbox.allowUnsandboxedCommands, false);
    assert.deepEqual((sandbox.network as Record<string, unknown>).deniedDomains, ['*']);
  } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
});

test('Claude configuration rejection and invalid streams remain incomplete without fallback', async () => {
  for (const [mode, pattern] of [
    ['settings-rejected', /sandbox settings rejected/],
    ['invalid-jsonl', /Invalid Claude JSONL/],
    ['missing-result', /missing required init or result events/],
    ['exit-no-stderr', /exited with code 8/],
  ] as const) {
    const fixture = await fakeClaude(mode);
    const isolation = await createIsolation();
    try {
      const result = await fixture.runner.run(request(isolation, 'work'));
      assert.equal(result.incomplete, true, mode);
      assert.match(result.error || '', pattern, mode);
    } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
  }
});

test('Claude redacts its API key from stdout, stderr, split chunks, JSONL, and errors', async () => {
  for (const mode of ['leak-stdout', 'leak-stderr', 'leak-split', 'leak-jsonl', 'leak-exit']) {
    const fixture = await fakeClaude(mode);
    const isolation = await createIsolation();
    try {
      const result = await fixture.runner.run(request(isolation, 'work'));
      assert.doesNotMatch(result.output, new RegExp(SECRET));
      assert.doesNotMatch(result.stderr || '', new RegExp(SECRET));
      assert.doesNotMatch(result.error || '', new RegExp(SECRET));
      assert.match(`${result.output}\n${result.stderr || ''}\n${result.error || ''}`, /REDACTED/);
    } finally { await destroyIsolation(isolation); await fixture.cleanup(); }
  }
});

test('Claude unsupported web search and failed runs produce inconclusive paired results', async () => {
  const fixture = await fakeClaude('settings-rejected');
  const root = await mkdtemp(join(tmpdir(), 'leogriel-claude-verdict-'));
  const skill = join(root, 'skill');
  try {
    await mkdir(skill);
    await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: test\n---\nwork');
    await assert.rejects(fixture.runner.preflight?.([{ mode: 'deny', webSearch: 'live' }]), /supports webSearch: disabled only/);
    const definition = validateTestFile({
      version: 1,
      skill: 'demo',
      cases: [{ name: 'case', prompt: 'work', runner: { id: 'claude' }, assertions: [{ type: 'file-exists', path: 'out' }] }],
    });
    const result = await runSkillTests(definition, {
      testFilePath: join(root, 'missing.yaml'),
      skillPath: skill,
      runner: fixture.runner,
      runs: 1,
      model: 'claude-test-model',
      leogrielVersion: '1.0.0-beta.2',
    });
    assert.equal(result.verdict, 'inconclusive');
  } finally { await fixture.cleanup(); await rm(root, { recursive: true, force: true }); }
});

test('Claude JSONL parser rejects error results and does not double-count cached input', () => {
  const output = [
    JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-test-model' }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done', usage: { input_tokens: 10, cache_read_input_tokens: 7, output_tokens: 2 } }),
  ].join('\n');
  assert.deepEqual(parseClaudeJsonl(output).tokenUsage, { input: 10, cachedInput: 7, output: 2, reasoning: 0, total: 12 });
  const failed = output.replace('"success"', '"error"').replace('"is_error":false', '"is_error":true');
  assert.equal(parseClaudeJsonl(failed).completed, false);
});

function request(layout: Awaited<ReturnType<typeof createIsolation>>, prompt: string): AgentRunRequest {
  return {
    prompt,
    workspace: layout.workspace,
    isolationRoot: layout.root,
    timeoutMs: 2_000,
    network: { mode: 'deny', webSearch: 'disabled' },
    requestedModel: 'claude-test-model',
    auth: {
      runner: 'claude', mode: 'api-key',
      payload: { mode: 'api-key', apiKey: SECRET, source: 'ANTHROPIC_API_KEY' },
      knownSecrets: { ANTHROPIC_API_KEY: SECRET },
    },
  };
}

async function fakeClaude(mode: string) {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-fake-claude-'));
  const script = join(root, 'fake-claude.mjs');
  await writeFile(script, `
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = ${JSON.stringify(root)};
const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log(mode === 'old-version' ? '2.1.100' : '2.1.200 (Claude Code)'); process.exit(0); }
if (args.includes('--help')) { console.log(mode === 'missing-flags' ? '--print --output-format' : ${JSON.stringify(REQUIRED_HELP)}); process.exit(0); }
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
const settingsIndex = args.indexOf('--settings');
const settings = settingsIndex >= 0 ? JSON.parse(args[settingsIndex + 1]) : {};
if (mode === 'settings-rejected') { console.error('sandbox settings rejected'); process.exit(2); }
let childEnv = { ...process.env };
if (process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB === '1') {
  for (const key of Object.keys(childEnv)) if (/^(?:ANTHROPIC_|AWS_|GOOGLE_|AZURE_)/.test(key)) delete childEnv[key];
}
for (const item of settings?.sandbox?.credentials?.envVars || []) if (item.mode === 'deny') delete childEnv[item.name];
const child = spawnSync('node', ['-e', 'process.stdout.write(JSON.stringify({node:true,key:Boolean(process.env.ANTHROPIC_API_KEY)}))'], { env: childEnv, encoding: 'utf8' });
const childRecord = JSON.parse(child.stdout || '{}');
writeFileSync(join(root, 'record.json'), JSON.stringify({
  prompt, arguments: args.join(' '), settings, parentKey: Boolean(process.env.ANTHROPIC_API_KEY),
  childKey: childRecord.key === true, nodeFound: child.status === 0 && childRecord.node === true,
  claudeHome: process.env.CLAUDE_CONFIG_DIR,
}));
const secret = process.env.ANTHROPIC_API_KEY || '';
if (mode === 'invalid-jsonl') { console.log('{broken'); process.exit(0); }
if (mode === 'missing-result') { console.log(JSON.stringify({type:'system',subtype:'init'})); process.exit(0); }
if (mode === 'exit-no-stderr') process.exit(8);
if (mode === 'leak-stdout') console.log(secret);
if (mode === 'leak-stderr') console.error(secret);
if (mode === 'leak-split') {
  process.stdout.write(secret.slice(0, 13));
  await new Promise((resolve) => setTimeout(resolve, 30));
  process.stdout.write(secret.slice(13) + '\\n');
}
if (mode === 'leak-exit') { console.error('failed: ' + secret); process.exit(9); }
console.log(JSON.stringify({type:'system',subtype:'init',model:'claude-test-model',message:mode === 'leak-jsonl' ? secret : undefined}));
console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,result:'done',usage:{input_tokens:9,cache_read_input_tokens:4,output_tokens:3}}));
`);
  return {
    root,
    script,
    runner: new ClaudeRunner({
      command: process.execPath,
      commandArgs: [script],
      platform: 'linux',
      authEnvironment: { ANTHROPIC_API_KEY: SECRET },
    }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
