import { rm, cp, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { Provenance, LockfileEntry, ResolvedSource } from '@skillctl/core';
import {
  loadConfig,
  ensureDir,
  computeDirIntegrity,
  getCachedSkill,
  putCachedSkill,
  ensureCacheDir,
} from '@skillctl/core';
import { loadManifest, saveManifest } from '@skillctl/manifest';
import { loadLockfile, saveLockfile, createEmptyLockfile, addOrUpdateEntry, makeLockEntry } from '@skillctl/lockfile';
import { canonicalizeName } from './names.js';
import { limitedFetch } from './fetch/concurrency.js';
import { LocalSource } from './sources/local.js';
import { GitHubSource } from './sources/github.js';
import { NpmSource } from './sources/npm.js';
import { SkillsShSource } from './sources/skills-sh.js';
import type { RegistrySource } from '@skillctl/core';

export class RegistryManager {
  private sources: RegistrySource[] = [];

  constructor() {
    this.register(new NpmSource());
    this.register(new SkillsShSource());
    this.register(new GitHubSource());
    this.register(new LocalSource());
  }

  register(source: RegistrySource): void {
    this.sources.push(source);
  }

  getSources(): RegistrySource[] {
    return [...this.sources];
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    for (const src of this.sources) {
      if (src.match(spec)) {
        const res = await src.resolve(spec, options);
        return { ...res, originalSpec: spec };
      }
    }
    if (spec.includes('/') && !spec.includes(':')) {
      const gh = new GitHubSource();
      if (gh.match(spec)) {
        const res = await gh.resolve(spec, options);
        return { ...res, originalSpec: spec };
      }
    }
    throw new Error(`No registry source matched spec: ${spec}. Supported: github:, npm:, skills.sh/, file:, ./local`);
  }

  async materialize(
    resolved: ResolvedSource,
    options?: { name?: string }
  ): Promise<{ canonicalPath: string; integrity: string; sourceType: string }> {
    const config = await loadConfig();
    const store = config.store;
    await ensureDir(store);

    const canonicalName = canonicalizeName(options?.name || resolved.name);
    const target = join(store, canonicalName);
    const tmpDest = join(tmpdir(), `skillctl-mat-${canonicalName}-${Date.now()}`);
    await ensureDir(tmpDest);

    try {
      const source = this.sources.find((s) => s.id === resolved.sourceId);
      if (!source) throw new Error(`no source for materialize: ${resolved.sourceId}`);
      await limitedFetch(() => source.fetch(resolved, tmpDest));
    } catch (err) {
      await rm(tmpDest, { recursive: true, force: true }).catch(() => {});
      throw err;
    }

    const treeIntegrity = await computeDirIntegrity(tmpDest);
    await ensureCacheDir().catch(() => {});
    const cached = await getCachedSkill(treeIntegrity);
    let sourceForTarget = tmpDest;

    if (cached) {
      sourceForTarget = cached;
      await rm(tmpDest, { recursive: true, force: true }).catch(() => {});
    } else {
      await putCachedSkill(treeIntegrity, tmpDest).catch(() => {});
    }

    if (await exists(target)) {
      await rm(target, { recursive: true, force: true });
    }

    try {
      if (sourceForTarget === tmpDest) {
        await (await import('node:fs/promises')).rename(sourceForTarget, target);
      } else {
        await cp(sourceForTarget, target, { recursive: true, force: true });
      }
    } catch {
      await cp(sourceForTarget, target, { recursive: true, force: true });
      if (sourceForTarget === tmpDest) {
        await rm(sourceForTarget, { recursive: true, force: true });
      }
    }

    return { canonicalPath: target, integrity: treeIntegrity, sourceType: resolved.sourceType };
  }

  async add(spec: string, opts: { cwd?: string; updateManifest?: boolean } = {}): Promise<LockfileEntry> {
    const cwd = opts.cwd || process.cwd();
    const resolved = await this.resolve(spec);
    const mat = await this.materialize(resolved);

    const prov: Provenance = {
      type: resolved.sourceType === 'skills.sh' ? 'skills.sh' : resolved.sourceType,
      subpath: resolved.subpath,
    };
    if (resolved.sourceType === 'github' || resolved.sourceType === 'skills.sh') {
      prov.commit = resolved.ref;
    }
    if (resolved.sourceType === 'npm') {
      prov.tarballHash = resolved.tarballHash;
    }

    const entry = makeLockEntry(
      mat.canonicalPath.split(sep).pop()!,
      resolved.originalSpec || spec,
      resolved.resolved,
      mat.integrity,
      mat.canonicalPath,
      prov
    );

    let lock = (await loadLockfile(cwd)) || createEmptyLockfile();
    lock = addOrUpdateEntry(lock, entry.name, entry);
    await saveLockfile(lock, cwd);

    if (opts.updateManifest) {
      let manifest = await loadManifest(cwd);
      if (manifest) {
        if (!manifest.agentSkills) manifest.agentSkills = { dependencies: {}, devDependencies: {} };
        if (!manifest.agentSkills.dependencies) manifest.agentSkills.dependencies = {};
        let normSpec = spec;
        if (!/^(github:|npm:|skills\.sh\/|file:)/.test(spec)) {
          if (resolved.sourceType === 'github') normSpec = `github:${spec}`;
          else if (resolved.sourceType === 'npm') normSpec = `npm:${spec}`;
        }
        manifest.agentSkills.dependencies[entry.name] = normSpec;
        await saveManifest(manifest, cwd);
      }
    }

    return entry;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}