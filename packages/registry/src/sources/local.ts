import { cp, stat } from 'node:fs/promises';
import { resolve as pathResolve, join, basename } from 'node:path';
import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { ensureDir, computeDirIntegrity, loadConfig, parseImportedSpecifier } from '@skillctl/core';
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

  async resolve(spec: string, _options?: { ref?: string }): Promise<ResolvedSource> {
    const importedName = parseImportedSpecifier(spec);
    if (importedName) {
      const config = await loadConfig();
      const abs = join(config.store, importedName);
      return {
        name: importedName,
        resolved: `local:imported/${importedName}`,
        sourceType: 'local',
        sourceId: this.id,
        originalSpec: spec,
        localPath: abs,
      };
    }

    let localPath = spec;
    if (spec.startsWith('file:')) localPath = spec.slice(5);
    else if (spec.startsWith('local:')) localPath = spec.slice(6);
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
    try {
      await stat(resolved.localPath);
    } catch {
      const hint = parseImportedSpecifier(resolved.originalSpec)
        ? ' Skill was imported locally; re-run `skillctl import from-project` or add from a remote source.'
        : '';
      throw new Error(`Local skill path not found: ${resolved.localPath}.${hint}`);
    }
    await ensureDir(dest);
    await cp(resolved.localPath, dest, { recursive: true, force: true });
    return { integrity: await computeDirIntegrity(dest) };
  }
}