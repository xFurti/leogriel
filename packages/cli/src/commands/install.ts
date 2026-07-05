import type { Command } from 'commander';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile, createEmptyLockfile, saveLockfile } from '@skillctl/lockfile';
import { needsInstall, verifyLockIntegrity, lockToSkillTargets } from '@skillctl/core';
import { RegistryManager } from '@skillctl/registry';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { handleCommandError } from '../lib/errors.js';

export function registerInstall(program: Command, mgr?: RegistryManager): void {
  program
    .command('install')
    .alias('i')
    .description('Install/ensure all skills from agent-skills.json into canonical store')
    .option('--no-sync', 'skip linking to agents after install')
    .option('--frozen', 'fail if lock integrity does not match canonical store')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const manifest = await loadManifest(cwd);
        let lock = (await loadLockfile(cwd)) || createEmptyLockfile();
        const registry = mgr || new RegistryManager();

        if (options.frozen) {
          const errors = await verifyLockIntegrity(lock);
          if (errors.length) {
            console.error('Frozen install failed:');
            errors.forEach((e) => console.error(' -', e));
            process.exitCode = 2;
            return;
          }
        }

        let installed = 0;
        let skipped = 0;
        const deps = manifest?.agentSkills?.dependencies || {};

        for (const [name, spec] of Object.entries(deps)) {
          const existing = lock.skills[name];
          if (existing && !(await needsInstall(existing))) {
            console.log(`Using installed ${name}`);
            skipped++;
            continue;
          }
          console.log(`Installing ${name} from ${spec}...`);
          await registry.add(spec, { cwd, updateManifest: false });
          lock = (await loadLockfile(cwd)) || lock;
          installed++;
        }

        console.log(`Install complete. ${installed} fetched, ${skipped} from store.`);

        if (options.sync !== false) {
          const skills = lockToSkillTargets(lock);
          const res = await syncSkillsToAgents(skills);
          console.log(`Synced ${res.synced} links via adapters: ${res.adaptersUsed.join(', ') || 'none'}`);
          if (res.notes.length) console.log('Notes:', res.notes.join('; '));
        }
      } catch (err) {
        handleCommandError(err, 'install');
      }
    });
}