import { resolve } from 'node:path';

export type ResolvedCodexAuth =
  | { mode: 'api-key'; apiKey: string; source: 'CODEX_API_KEY' | 'OPENAI_API_KEY' }
  | { mode: 'chatgpt'; codexHome: string };

export function resolveCodexAuth(env: NodeJS.ProcessEnv = process.env): ResolvedCodexAuth {
  const mode = env.SKILLCTL_CODEX_AUTH_MODE || 'api-key';
  if (mode !== 'api-key' && mode !== 'chatgpt') {
    throw new Error('SKILLCTL_CODEX_AUTH_MODE must be api-key or chatgpt');
  }
  const codex = env.CODEX_API_KEY;
  const openai = env.OPENAI_API_KEY;
  if (mode === 'chatgpt') {
    if (codex || openai) throw new Error('ChatGPT authentication cannot be combined with CODEX_API_KEY or OPENAI_API_KEY');
    const authHome = env.SKILLCTL_CODEX_AUTH_HOME?.trim();
    if (!authHome) {
      throw new Error('ChatGPT authentication requires an explicit SKILLCTL_CODEX_AUTH_HOME; skillctl never uses ~/.codex automatically');
    }
    return { mode: 'chatgpt', codexHome: resolve(authHome) };
  }
  if (codex && openai && codex !== openai) throw new Error('CODEX_API_KEY and OPENAI_API_KEY are both set with different values');
  if (codex) return { mode: 'api-key', apiKey: codex, source: 'CODEX_API_KEY' };
  if (openai) return { mode: 'api-key', apiKey: openai, source: 'OPENAI_API_KEY' };
  throw new Error('Codex authentication requires CODEX_API_KEY or OPENAI_API_KEY');
}
