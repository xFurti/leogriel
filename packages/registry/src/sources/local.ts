import { cp, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize as pathNormalize } from 'node:path';
import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import {
  ensureDir,
  computeDirIntegrity,
  loadConfig,
  parseImportedSpecifier,
  normalizeLocalSpecifier,
} from '@skillctl/core';

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

  async resolve(spec: string, options?: { ref?: string; cwd?: string }): Promise<ResolvedSource> {
    const cwd = options?.cwd ?? process.cwd();
    // Legacy lock/manifest: local:/absolute/path (pre-0.3.1 resolved form)
    if (spec.startsWith('local:') && !spec.startsWith('local:imported/')) {
      const legacyPath = pathNormalize(spec.slice('local:'.length));
      if (isAbsolute(legacyPath)) {
        const norm = normalizeLocalSpecifier(`file:${legacyPath}`, cwd);
        return {
          name: norm.name,
          resolved: norm.portable,
          sourceType: 'local',
          sourceId: this.id,
          originalSpec: spec,
          localPath: legacyPath,
        };
      }
    }

    const importedName = parseImportedSpecifier(spec);
    if (importedName) {
      const config = await loadConfig();
      const abs = join(config.store, importedName);
      const portable = `local:imported/${importedName}`;
      return {
        name: importedName,
        resolved: portable,
        sourceType: 'local',
        sourceId: this.id,
        originalSpec: spec,
        localPath: abs,
      };
    }

    const norm = normalizeLocalSpecifier(spec, cwd);
    return {
      name: norm.name,
      resolved: norm.portable,
      sourceType: 'local',
      sourceId: this.id,
      originalSpec: spec,
      localPath: norm.absPath,
    };
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    if (!resolved.localPath) throw new Error('Invalid local resolved');
    try {
      await stat(resolved.localPath);
    } catch {
      const hint = parseImportedSpecifier(resolved.originalSpec)
        ? ' Skill was imported locally; re-run `skillctl import` or add it from a remote source.'
        : '';
      throw new Error(`Local skill path not found: ${resolved.localPath}.${hint}`);
    }
    await ensureDir(dest);
    await cp(resolved.localPath, dest, { recursive: true, force: true });
    return { integrity: await computeDirIntegrity(dest) };
  }
}
