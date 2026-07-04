import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadManifest, createDefaultManifest, saveManifest } from '@skillctl/manifest';
import { loadLockfile, createEmptyLockfile, saveLockfile, addOrUpdateEntry } from '@skillctl/lockfile';
import { loadConfig } from '@skillctl/core';
import { RegistryManager } from '@skillctl/registry';
import { scanCoexistence, getEnabledAdapters, allAdapters, syncSkillsToAgents } from '@skillctl/adapters';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json (works in built dist and source)
const pkgPath = join(__dirname, '..', 'package.json');
let version = '0.0.1';
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkg.version || version;
} catch {
  // fallback in case of packaging layout
}

const program = new Command();

program
  .name('skillctl')
  .description('Universal package-manager-like CLI for Agent Skills')
  .version(version, '-v, --version', 'output the current version')
  .helpOption('-h, --help', 'display help for command');

// PR3: list and doctor stubs (load manifest/lock/config for realism)
program
  .command('list')
  .description('List installed skills from lockfile (and manifest)')
  .option('--json', 'output JSON')
  .action(async (options) => {
    const cwd = process.cwd();
    const manifest = await loadManifest(cwd);
    const lock = await loadLockfile(cwd);
    const skills = lock ? Object.keys(lock.skills) : [];
    if (options.json) {
      console.log(JSON.stringify({ manifest: manifest ?? null, lock: lock ?? null, skills }, null, 2));
      return;
    }
    console.log('skillctl list');
    if (manifest) {
      console.log('Manifest found with', Object.keys(manifest.agentSkills?.dependencies || {}).length, 'deps');
    } else {
      console.log('No agent-skills.json (run `skillctl init`)');
    }
    console.log('Skills in lock:', skills.length ? skills.join(', ') : '(none)');
    console.log('(Use `sync` to materialize links; `install` for full from manifest)');
  });

program
  .command('doctor')
  .description('Diagnose environment, links, config, manifest/lock issues + coexistence')
  .option('--json', 'output JSON')
  .action(async (options) => {
    const cwd = process.cwd();
    const [config, manifest, lock, coexist, enabledAdapters] = await Promise.all([
      loadConfig(),
      loadManifest(cwd),
      loadLockfile(cwd),
      scanCoexistence(cwd),
      getEnabledAdapters(),
    ]);
    const issues: string[] = [];
    if (!manifest) issues.push('No agent-skills.json in project');
    if (!lock) issues.push('No agent-skills.lock (run install in future)');
    // collision policy note surfaced
    issues.push('Collision policy: project manifest wins over global (future); duplicates checked in manifest parser');
    if (coexist.detected) {
      issues.push('Coexistence markers detected (see details)');
    }
    const report = {
      status: issues.length ? 'issues' : 'ok',
      config: { store: config.store, defaultMode: config.defaultMode },
      manifestPresent: !!manifest,
      lockPresent: !!lock,
      lockVersion: lock?.lockfileVersion,
      issues,
      adapters: {
        registered: allAdapters.map((a) => a.id),
        enabled: enabledAdapters.map((a) => a.id),
      },
      coexistence: coexist,
      note: 'v0.1: full commands, cache, expanded Windows/coexistence. See README and doctor output.',
    };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log('skillctl doctor (stub)');
    console.log('Config store:', report.config.store);
    console.log('Manifest:', report.manifestPresent ? 'present' : 'missing');
    console.log('Lockfile v' + (report.lockVersion || '?') + ':', report.lockPresent ? 'present' : 'missing');
    console.log('Adapters enabled:', report.adapters.enabled.join(', '));
    if (coexist.detected) {
      console.log('Coexistence:', coexist.details.join('; '));
      if (coexist.recommendations.length) console.log('Recommendations:', coexist.recommendations.join('; '));
    }
    if (issues.length) console.log('Issues:', issues.join('; '));
    console.log('Exit code would be', issues.length ? 1 : 0, '(warnings=1, errors=2 per design)');
  });

// Basic init stub too (mentioned in plan, helps fixtures)
program
  .command('init')
  .description('Initialize agent-skills.json in current project')
  .action(async () => {
    const existing = await loadManifest();
    if (existing) {
      console.log('agent-skills.json already exists');
      return;
    }
    const sample = createDefaultManifest('demo-project');
    await saveManifest(sample);
    console.log('Created agent-skills.json with:', JSON.stringify(sample, null, 2));
    console.log('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
  });

// Basic add (PR4): uses RegistryManager for multi-source resolve + materialize + lock update.
// Supports github:, npm:, skills.sh/, file: etc. Stubs other flags.
program
  .command('add <spec>')
  .description('Add a skill from github, npm, local, skills.sh (registry + cache)')
  .option('--global', 'add to global (future)')
  .option('--no-manifest', 'do not update agent-skills.json')
  .action(async (spec, options) => {
    try {
      const mgr = new RegistryManager();
      console.log(`Resolving ${spec} via registry...`);
      const entry = await mgr.add(spec, {
        updateManifest: options.manifest !== false,
      });
      console.log(`Added ${entry.name}`);
      console.log(`  resolved: ${entry.resolved}`);
      console.log(`  integrity: ${entry.integrity}`);
      console.log(`  canonical: ${entry.canonicalPath}`);
      console.log(`  provenance: ${JSON.stringify(entry.provenance)}`);
      console.log('Lock updated. (PR12: uses content-addressable cache + limited parallel for perf)');
    } catch (err: any) {
      console.error('add failed:', err.message || err);
      process.exitCode = 1;
    }
  });

// PR12: install - ensure skills from manifest/lock are in canonical store (uses registry + cache)
program
  .command('install')
  .alias('i')
  .description('Install/ensure all skills from agent-skills.json (and lock) into canonical store. Uses cache for perf.')
  .option('--no-sync', 'skip linking to agents after install')
  .action(async (options) => {
    try {
      const cwd = process.cwd();
      const manifest = await loadManifest(cwd);
      let lock = await loadLockfile(cwd) || createEmptyLockfile();
      const mgr = new RegistryManager();
      let installed = 0;
      const deps = manifest?.agentSkills?.dependencies || {};
      for (const [name, spec] of Object.entries(deps)) {
        // check if lock has it and canonical exists with matching integrity
        const existing = lock.skills[name];
        const canonical = existing ? existing.canonicalPath : '';
        let needFetch = true;
        if (existing) {
          try {
            const { stat } = await import('node:fs/promises');
            await stat(canonical); // exists
            // fast path: trust lock integrity if dir present (full verify optional in doctor)
            needFetch = false;
          } catch {
            needFetch = true;
          }
        }
        if (needFetch) {
          console.log(`Installing ${name} from ${spec}...`);
          const entry = await mgr.add(spec, { cwd, updateManifest: false }); // lock updated inside
          lock = await loadLockfile(cwd) || lock; // reload
          installed++;
        } else {
          console.log(`Using cached/installed ${name} (integrity ${existing!.integrity.slice(0,16)}...)`);
        }
      }
      console.log(`Install complete. ${installed} fetched (others from store/cache).`);

      if (options.sync !== false) {
        const skills = Object.values(lock.skills || {}).map((e: any) => ({ name: e.name, canonicalPath: e.canonicalPath }));
        const res = await syncSkillsToAgents(skills);
        console.log(`Synced ${res.synced} links via adapters: ${res.adaptersUsed.join(', ') || 'none'}`);
        if (res.notes.length) console.log('Notes:', res.notes.join('; '));
      }
    } catch (err: any) {
      console.error('install failed:', err.message || err);
      process.exitCode = 1;
    }
  });

// sync - link skills (from lock) to detected agents (PR7+PR12 polish)
program
  .command('sync')
  .description('Sync canonical skills to all enabled/detected agent directories (symlink/junction/copy via adapters).')
  .option('--dry-run', 'show what would be done')
  .action(async (options) => {
    try {
      const cwd = process.cwd();
      const lock = await loadLockfile(cwd);
      if (!lock || Object.keys(lock.skills || {}).length === 0) {
        console.log('No lockfile or skills to sync. Run install or add first.');
        return;
      }
      const skills = Object.values(lock.skills).map((e) => ({ name: e.name, canonicalPath: e.canonicalPath }));
      const res = await syncSkillsToAgents(skills, { dryRun: options.dryRun });
      console.log(`sync: ${res.synced} targets processed (adapters: ${res.adaptersUsed.join(', ') || 'none'})`);
      if (res.notes.length) console.log('Notes:', res.notes.join(' | '));
      if (options.dryRun) console.log('(dry-run complete)');
    } catch (err: any) {
      console.error('sync failed:', err.message || err);
      process.exitCode = 1;
    }
  });

// remove / rm - remove skill from manifest+lock + unlink (polish for v0.1)
program
  .command('remove <name>')
  .alias('rm')
  .description('Remove skill by name: delete from manifest/lock, remove links (canonical store left for safety).')
  .option('--global', 'affect global (future)')
  .option('--purge', 'also remove from canonical ~/.skillctl/skills/<name> (dangerous)')
  .action(async (name, options) => {
    try {
      const cwd = process.cwd();
      let manifest = await loadManifest(cwd);
      let lock = await loadLockfile(cwd);
      const canonicalName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let changed = false;
      if (manifest?.agentSkills?.dependencies?.[canonicalName]) {
        delete manifest.agentSkills.dependencies[canonicalName];
        await saveManifest(manifest, cwd);
        changed = true;
        console.log(`Removed ${canonicalName} from manifest.`);
      }
      if (lock?.skills?.[canonicalName]) {
        const entry = lock.skills[canonicalName];
        delete lock.skills[canonicalName];
        await saveLockfile(lock, cwd);
        changed = true;
        console.log(`Removed ${canonicalName} from lock (was at ${entry.canonicalPath}).`);
        // unlink targets (best effort)
        try {
          const adapters = await getEnabledAdapters();
          for (const ad of adapters) {
            for (const p of [...ad.projectPaths, ...ad.globalPaths]) {
              const { join: pathJoin } = await import('node:path');
              const t = (p.startsWith('.') ? pathJoin(cwd, p) : p) + '/' + canonicalName; // rough
              await ad.removeTarget(canonicalName, t).catch(() => {});
            }
          }
        } catch {}
      }
      if (options.purge) {
        const { rm } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const { homedir } = await import('node:os');
        const p = join(homedir(), '.skillctl', 'skills', canonicalName);
        await rm(p, { recursive: true, force: true }).catch(() => {});
        console.log('Purged canonical dir too.');
      }
      if (!changed) console.log(`No entry for ${name} found.`);
      else console.log('Done. Run `sync` or `install` to clean state if needed.');
    } catch (err: any) {
      console.error('remove failed:', err.message || err);
      process.exitCode = 1;
    }
  });

// Export program for tests, future lib use, or bin shim.
// parse() is intentionally called from the bin entry (packages/cli/bin/skillctl.js)
// to avoid side effects on `import '@skillctl/cli'` or `require`.
export { program };
