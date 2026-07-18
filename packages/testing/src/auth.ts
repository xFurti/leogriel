import { resolve } from 'node:path';
import type { RunnerAuthContext } from './types.js';

export type ResolvedCodexAuth =
  | { mode: 'api-key'; apiKey: string; source: 'CODEX_API_KEY' | 'OPENAI_API_KEY' }
  | { mode: 'chatgpt'; codexHome: string };

export function resolveCodexAuth(env: NodeJS.ProcessEnv = process.env): ResolvedCodexAuth {
  const mode = env.LEOGRIEL_CODEX_AUTH_MODE ?? env.SKILLCTL_CODEX_AUTH_MODE ?? 'api-key';
  if (mode !== 'api-key' && mode !== 'chatgpt') {
    throw new Error('LEOGRIEL_CODEX_AUTH_MODE must be api-key or chatgpt');
  }
  const codex = env.CODEX_API_KEY;
  const openai = env.OPENAI_API_KEY;
  if (mode === 'chatgpt') {
    if (codex || openai) throw new Error('ChatGPT authentication cannot be combined with CODEX_API_KEY or OPENAI_API_KEY');
    const authHome = (env.LEOGRIEL_CODEX_AUTH_HOME ?? env.SKILLCTL_CODEX_AUTH_HOME)?.trim();
    if (!authHome) {
      throw new Error('ChatGPT authentication requires an explicit LEOGRIEL_CODEX_AUTH_HOME; leogriel never uses ~/.codex automatically');
    }
    return { mode: 'chatgpt', codexHome: resolve(authHome) };
  }
  if (codex && openai && codex !== openai) throw new Error('CODEX_API_KEY and OPENAI_API_KEY are both set with different values');
  if (codex) return { mode: 'api-key', apiKey: codex, source: 'CODEX_API_KEY' };
  if (openai) return { mode: 'api-key', apiKey: openai, source: 'OPENAI_API_KEY' };
  throw new Error('Codex authentication requires CODEX_API_KEY or OPENAI_API_KEY');
}

export function resolveCodexRunnerAuth(env: NodeJS.ProcessEnv = process.env): RunnerAuthContext {
  const resolved = resolveCodexAuth(env);
  return {
    runner: 'codex',
    mode: resolved.mode,
    payload: resolved,
    knownSecrets: resolved.mode === 'api-key'
      ? { CODEX_API_KEY: resolved.apiKey, OPENAI_API_KEY: resolved.apiKey }
      : {},
  };
}

export interface ResolvedClaudeAuth {
  mode: 'api-key';
  apiKey: string;
  source: 'ANTHROPIC_API_KEY';
}

export function resolveClaudeAuth(env: NodeJS.ProcessEnv = process.env): ResolvedClaudeAuth {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('Claude authentication requires ANTHROPIC_API_KEY');
  if (apiKey.length < 12) throw new Error('ANTHROPIC_API_KEY is too short to be a valid credential');
  return { mode: 'api-key', apiKey, source: 'ANTHROPIC_API_KEY' };
}

export function resolveClaudeRunnerAuth(env: NodeJS.ProcessEnv = process.env): RunnerAuthContext {
  const resolved = resolveClaudeAuth(env);
  return {
    runner: 'claude',
    mode: resolved.mode,
    payload: resolved,
    knownSecrets: { ANTHROPIC_API_KEY: resolved.apiKey },
  };
}
