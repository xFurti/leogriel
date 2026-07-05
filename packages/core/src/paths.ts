import { join } from 'node:path';

/** Resolve adapter target base + skill name (project-relative or absolute global). */
export function resolveAdapterTarget(basePath: string, skillName: string, cwd = process.cwd()): string {
  const resolvedBase = basePath.startsWith('.') ? join(cwd, basePath) : basePath;
  return join(resolvedBase, skillName);
}