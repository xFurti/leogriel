import type { Command } from 'commander';
import {
  canonicalizeName,
  loadConfig,
  purgeCanonical,
  resolveAdapterTarget,
  resolveEntryCanonicalPath,
  type LockfileEntry,
} from '@skillctl/core';
import { getEnabledAdapters } from '@skillctl/adapters';
import { updateProjectState, withOperationLocks } from '@skillctl/project-state';
import { handleCommandError } from '../lib/errors.js';

export function registerRemove(program: Command): void {
  program
    .command('remove <name>')
    .alias('rm')
    .description('Remove skill from manifest/lock and unlink agent targets')
    .option('--purge', 'also remove from canonical ~/.skillctl/skills/<name>')
    .action(async (name, options) => {
      try {
        const cwd = process.cwd();
        const config = await loadConfig();
        const canonicalName = canonicalizeName(name);
        await withOperationLocks({ cwd, store: config.store }, async () => {
          let removedEntry: LockfileEntry | undefined;
          let changed = false;
          await updateProjectState(cwd, async (state) => {
            const manifest = state.manifest;
            const lock = state.lockfile;
            if (manifest?.agentSkills?.dependencies?.[canonicalName]) {
              delete manifest.agentSkills.dependencies[canonicalName];
              changed = true;
            }
            if (manifest?.agentSkills?.devDependencies?.[canonicalName]) {
              delete manifest.agentSkills.devDependencies[canonicalName];
              changed = true;
            }
            if (lock?.skills[canonicalName]) {
              removedEntry = lock.skills[canonicalName];
              delete lock.skills[canonicalName];
              changed = true;
            }
            return { state: { manifest, lockfile: lock }, result: undefined };
          });

          if (removedEntry) {
            const canonicalPath = await resolveEntryCanonicalPath(removedEntry);
            for (const adapter of await getEnabledAdapters()) {
              for (const path of [...adapter.projectPaths, ...adapter.globalPaths]) {
                const target = resolveAdapterTarget(path, canonicalName, cwd);
                await adapter.removeTarget(canonicalName, target, canonicalPath).catch((err) => {
                  console.warn(`Skipped unsafe target ${target}: ${(err as Error).message}`);
                });
              }
            }
          }
          if (options.purge) await purgeCanonical(canonicalName);
          if (!changed && !options.purge) console.log(`No entry for ${name} found.`);
          else console.log(`Removed ${canonicalName}.`);
        });
      } catch (err) {
        handleCommandError(err, 'remove');
      }
    });
}
