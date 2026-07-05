import { cp, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  canonicalizeName,
  computeDirIntegrity,
  ensureDir,
  type LockfileEntry,
  type Provenance,
} from '@skillctl/core';
import { loadLockfile, saveLockfile, createEmptyLockfile, addOrUpdateEntry, makeLockEntry } from '@skillctl/lockfile';
import { loadManifest, saveManifest } from '@skillctl/manifest';
import { RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { parseNpxSkillsLock, findNpxLock } from './parsers/npx-skills-lock.js';
import { scanAgentsSkillsDir } from './parsers/agents-skills-dir.js';
import { scanPythonSkillctlRepos } from './parsers/python-skillctl.js';

export interface ImportOptions {
  cwd?: string;
  dryRun?: boolean;
  yes?: boolean;
  adopt?: boolean;
  writeManifest?: boolean;
  source: 'npx' | 'python-skillctl';
}

export interface ImportPlanItem {
  name: string;
  action: 'fetch' | 'copy-local' | 'skip-existing';
  specifier?: string;
  localPath?: string;
  note?: string;
}

export interface ImportResult {
  plan: ImportPlanItem[];
  imported: string[];
  skipped: string[];
  errors: string[];
}

async function materializeLocal(localPath: string, name: string, cwd: string, prov: Provenance): Promise<LockfileEntry> {
  const config = await import('@skillctl/core').then((m) => m.loadConfig());
  const store = config.store;
  const canonicalName = canonicalizeName(name);
  const target = join(store, canonicalName);
  await ensureDir(target);
  await cp(localPath, target, { recursive: true, force: true });
  const integrity = await computeDirIntegrity(target);
  return makeLockEntry(canonicalName, prov.originalSource || `file:${localPath}`, `local:${localPath}`, integrity, target, prov);
}

export async function planImportFromNpx(cwd: string): Promise<ImportPlanItem[]> {
  const plan: ImportPlanItem[] = [];
  const lockPath = await findNpxLock(cwd);
  const lock = (await loadLockfile(cwd)) || createEmptyLockfile();

  if (lockPath) {
    const entries = await parseNpxSkillsLock(lockPath);
    for (const e of entries) {
      const name = canonicalizeName(e.name);
      if (lock.skills[name]) {
        plan.push({ name, action: 'skip-existing', note: 'already in agent-skills.lock' });
        continue;
      }
      if (e.source) {
        plan.push({ name, action: 'fetch', specifier: normalizeNpxSource(e.source, e.ref) });
      } else {
        plan.push({ name, action: 'copy-local', localPath: join(cwd, '.agents', 'skills', name) });
      }
    }
  }

  const agentsDir = join(cwd, '.agents', 'skills');
  const dirSkills = await scanAgentsSkillsDir(agentsDir);
  for (const s of dirSkills) {
    const name = canonicalizeName(s.name);
    if (plan.some((p) => p.name === name)) continue;
    if (lock.skills[name]) {
      plan.push({ name, action: 'skip-existing' });
      continue;
    }
    plan.push({ name, action: 'copy-local', localPath: s.localPath });
  }

  return plan;
}

function normalizeNpxSource(source: string, ref?: string): string {
  if (source.startsWith('github:') || source.startsWith('npm:') || source.startsWith('file:')) {
    return ref ? `${source}@${ref}` : source;
  }
  if (source.includes('/') && !source.includes(':')) {
    return `github:${source}${ref ? `@${ref}` : ''}`;
  }
  return source;
}

export async function executeImport(opts: ImportOptions): Promise<ImportResult> {
  const cwd = opts.cwd || process.cwd();
  const result: ImportResult = { plan: [], imported: [], skipped: [], errors: [] };

  if (opts.source === 'npx') {
    result.plan = await planImportFromNpx(cwd);
  } else {
    const pyEntries = await scanPythonSkillctlRepos();
    const lock = (await loadLockfile(cwd)) || createEmptyLockfile();
    for (const e of pyEntries) {
      const name = canonicalizeName(e.name);
      if (lock.skills[name]) {
        result.plan.push({ name, action: 'skip-existing' });
      } else {
        result.plan.push({ name, action: 'copy-local', localPath: e.localPath });
      }
    }
  }

  if (opts.dryRun) return result;

  const mgr = new RegistryManager();
  let lock = (await loadLockfile(cwd)) || createEmptyLockfile();

  for (const item of result.plan) {
    if (item.action === 'skip-existing') {
      result.skipped.push(item.name);
      continue;
    }

    try {
      let entry: LockfileEntry;
      const prov: Provenance = {
        type: 'other',
        migratedFrom: opts.source === 'npx' ? 'npx' : 'python-skillctl',
        originalSource: item.specifier || item.localPath,
      };

      if (item.action === 'fetch' && item.specifier) {
        entry = await mgr.add(item.specifier, { cwd, updateManifest: false });
        entry.provenance = { ...entry.provenance, ...prov };
      } else if (item.action === 'copy-local' && item.localPath) {
        try {
          await stat(item.localPath);
        } catch {
          result.errors.push(`${item.name}: local path not found ${item.localPath}`);
          continue;
        }
        entry = await materializeLocal(item.localPath, item.name, cwd, prov);
      } else {
        continue;
      }

      lock = addOrUpdateEntry(lock, entry.name, entry);
      result.imported.push(entry.name);
    } catch (e) {
      result.errors.push(`${item.name}: ${(e as Error).message}`);
    }
  }

  lock.metadata = { ...lock.metadata, migratedAt: new Date().toISOString(), toolVersion: '0.2.0' };
  await saveLockfile(lock, cwd);

  if (opts.writeManifest) {
    let manifest = (await loadManifest(cwd)) || (await import('@skillctl/manifest')).createDefaultManifest();
    if (!manifest.agentSkills) manifest.agentSkills = { dependencies: {}, devDependencies: {} };
    if (!manifest.agentSkills.dependencies) manifest.agentSkills.dependencies = {};
    for (const name of result.imported) {
      const entry = lock.skills[name];
      if (entry) manifest.agentSkills.dependencies[name] = entry.specifier;
    }
    await saveManifest(manifest, cwd);
  }

  if (opts.adopt && result.imported.length > 0) {
    const skills = result.imported.map((n) => ({
      name: n,
      canonicalPath: lock.skills[n].canonicalPath,
    }));
    await syncSkillsToAgents(skills);
  }

  return result;
}