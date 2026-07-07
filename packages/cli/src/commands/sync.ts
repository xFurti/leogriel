import type { Command } from 'commander';
import { loadLockfile } from '@skillctl/lockfile';
import { lockToSkillTargets } from '@skillctl/core';
import { syncSkillsToAgents } from '@skillctl/adapters';
import { handleCommandError } from '../lib/errors.js';

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Sync canonical skills to all enabled agent directories')
    .option('--dry-run', 'show what would be done')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const lock = await loadLockfile(cwd);
        if (!lock || Object.keys(lock.skills || {}).length === 0) {
          console.log('No lockfile or skills to sync. Run install or add first.');
          return;
        }
        const skills = await lockToSkillTargets(lock);
        const res = await syncSkillsToAgents(skills, { dryRun: options.dryRun });
        console.log(`sync: ${res.synced} targets processed (adapters: ${res.adaptersUsed.join(', ') || 'none'})`);
        if (res.notes.length) console.log('Notes:', res.notes.join(' | '));
        if (options.dryRun) console.log('(dry-run complete)');
      } catch (err) {
        handleCommandError(err, 'sync');
      }
    });
}