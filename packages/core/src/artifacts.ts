import { link, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { redactSecrets, type RedactionSummary } from './redaction.js';

export type ArtifactKind = 'audit' | 'test' | 'reports';

export interface ArtifactEnvelope<T> {
  schemaVersion: 1;
  kind: ArtifactKind;
  createdAt: string;
  redactions: RedactionSummary;
  data: T;
}

export function artifactRoot(cwd = process.cwd(), scope: 'project' | 'global' = 'project'): string {
  return scope === 'global' ? join(homedir(), '.leogriel', 'artifacts') : resolve(cwd, '.leogriel', 'artifacts');
}

export async function writeArtifact<T>(
  kind: ArtifactKind,
  output: string,
  data: T,
  options: { cwd?: string; scope?: 'project' | 'global'; knownSecrets?: Record<string, string | undefined> } = {},
): Promise<{ path: string; envelope: ArtifactEnvelope<T> }> {
  const root = artifactRoot(options.cwd, options.scope);
  const kindRoot = resolve(root, kind);
  const target = resolve(kindRoot, output);
  const rel = relative(kindRoot, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Artifact output escapes its managed directory');
  const redacted = redactSecrets(data, options.knownSecrets);
  const envelope: ArtifactEnvelope<T> = {
    schemaVersion: 1,
    kind,
    createdAt: new Date().toISOString(),
    redactions: redacted.redactions,
    data: redacted.value,
  };
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await link(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  return { path: target, envelope };
}
