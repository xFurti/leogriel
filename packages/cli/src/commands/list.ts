import { cliLog } from '../lib/output.js';
import type { Command } from 'commander';
import { loadManifest } from '@leogriel/manifest';
import { loadLockfile } from '@leogriel/lockfile';
import { getGlobalLeogrielRoot, requireLeogrielProject } from '@leogriel/core';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List installed skills from lockfile (and manifest)')
    .option('--json', 'output JSON')
    .option('-g, --global', 'list globally installed skills')
    .action(async (options) => {
      const cwd = options.global ? getGlobalLeogrielRoot() : await requireLeogrielProject();
      const manifest = await loadManifest(cwd);
      const lock = await loadLockfile(cwd);
      const skills = lock ? Object.keys(lock.skills) : [];

      if (options.json) {
        cliLog(JSON.stringify({ manifest: manifest ?? null, lock: lock ?? null, skills }, null, 2));
        return;
      }

      cliLog('leogriel list');
      if (manifest) {
        cliLog('Manifest deps:', Object.keys(manifest.agentSkills?.dependencies || {}).length);
      } else {
        cliLog('No agent-skills.json (run `leogriel init`)');
      }
      cliLog('Skills in lock:', skills.length ? skills.join(', ') : '(none)');
    });
}
