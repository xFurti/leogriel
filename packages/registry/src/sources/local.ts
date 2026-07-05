import { cp } from 'node:fs/promises';
import { resolve as pathResolve, basename } from 'node:path';
import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { ensureDir, computeDirIntegrity } from '@skillctl/core';
import { canonicalizeName } from '../names.js';

export class LocalSource implements RegistrySource {
  readonly id = 'local';

  match(spec: string): boolean {
    return (
      spec.startsWith('file:') ||
      spec.startsWith('local:') ||
      spec.startsWith('./') ||
      spec.startsWith('../') ||
      /^[a-zA-Z]:\\/.test(spec) ||
      spec.startsWith('/')
    );
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let localPath = spec;
    if (spec.startsWith('file:')) localPath = spec.slice(5);
    if (spec.startsWith('local:')) localPath = spec.slice(6);
    const abs = pathResolve(process.cwd(), localPath);
    return {
      name: canonicalizeName(basename(abs)),
      resolved: `local:${abs}`,
      sourceType: 'local',
      sourceId: this.id,
      originalSpec: spec,
      localPath: abs,
    };
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    if (!resolved.localPath) throw new Error('Invalid local resolved');
    await ensureDir(dest);
    await cp(resolved.localPath, dest, { recursive: true, force: true });
    return { integrity: await computeDirIntegrity(dest) };
  }
}