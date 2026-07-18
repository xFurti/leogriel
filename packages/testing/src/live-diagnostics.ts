import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { redactSecrets } from '@leogriel/core';

export interface LiveSmokeDiagnostics {
  exitCode: number | null;
  timedOut: boolean;
  incomplete: boolean;
  outputTruncated: boolean;
  requestedModel: string | null;
  resolvedModel: string | null;
  eventTypes: string[];
  finalAgentMessage: string | null;
  stderr: string;
  workspaceFiles: string[];
}

export function inspectCodexJsonl(output: string): Pick<LiveSmokeDiagnostics, 'eventTypes' | 'finalAgentMessage'> {
  const events: Record<string, unknown>[] = [];
  const eventTypes: string[] = [];
  for (const line of output.split(/\r?\n/).filter((entry) => entry.trim())) {
    try {
      const event = JSON.parse(line) as unknown;
      if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('invalid event');
      const record = event as Record<string, unknown>;
      const type = typeof record.type === 'string' ? record.type : 'unknown';
      eventTypes.push(type);
      events.push(record);
    } catch {
      eventTypes.push('invalid-jsonl');
    }
  }
  let finalAgentMessage: string | null = null;
  for (const event of events.reverse()) {
    const item = event.item;
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      if (record.type === 'agent_message' && typeof record.text === 'string') {
        finalAgentMessage = record.text;
        break;
      }
    }
    if (event.type === 'agent_message' && typeof event.message === 'string') {
      finalAgentMessage = event.message;
      break;
    }
  }
  return { eventTypes, finalAgentMessage };
}

export async function listLiveWorkspaceFiles(root: string, limit = 200): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= limit) return;
      const path = join(directory, entry.name);
      const name = relative(root, path).replace(/\\/g, '/');
      files.push(entry.isDirectory() ? `${name}/` : entry.isSymbolicLink() ? `${name} -> [symlink]` : name);
      if (entry.isDirectory()) await walk(path);
    }
  }
  await walk(root);
  if (files.length >= limit) files.push(`[truncated after ${limit} entries]`);
  return files;
}

export function redactLiveDiagnostics(
  diagnostics: LiveSmokeDiagnostics,
  env: NodeJS.ProcessEnv = process.env,
): LiveSmokeDiagnostics {
  return redactSecrets(diagnostics, {
    CODEX_API_KEY: env.CODEX_API_KEY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
  }).value;
}
