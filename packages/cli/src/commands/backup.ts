import type { Command } from 'commander';
import * as prompts from '@clack/prompts';
import { getBackup, listBackups, removeBackup, restoreBackup } from '@skillctl/adapters';
import { cliLog } from '../lib/output.js';
import { handleCommandError, SkillctlError } from '../lib/errors.js';

export function registerBackup(program: Command): void {
  const backup = program.command('backup').description('Inspect and restore skillctl backups');
  backup.command('list').option('--project').option('--global').option('--json').action(async (options) => {
    try {
      const scope = selectScope(options);
      const backups = await listBackups({ scope });
      if (options.json) cliLog(JSON.stringify({ scope, backups }, null, 2));
      else for (const item of backups) cliLog(`${item.id} ${item.timestamp} ${item.originalPath}`);
    } catch (error) { handleCommandError(error, 'backup list'); }
  });
  backup.command('info <id>').option('--json').action(async (id, options) => {
    try {
      const record = await getBackup(id);
      if (!record) throw new SkillctlError(`Backup not found: ${id}`, 'BACKUP_NOT_FOUND', 1);
      if (options.json) cliLog(JSON.stringify(record, null, 2));
      else cliLog(JSON.stringify(record, null, 2));
    } catch (error) { handleCommandError(error, 'backup info'); }
  });
  for (const action of ['restore', 'remove'] as const) {
    backup.command(`${action} <id>`).option('--dry-run').option('-y, --yes').option('--json').action(async (id, options) => {
      try {
        await confirmDangerous(`${action} backup ${id}?`, options);
        const result = action === 'restore'
          ? await restoreBackup(id, { dryRun: options.dryRun })
          : await removeBackup(id, { dryRun: options.dryRun });
        if (options.json) cliLog(JSON.stringify(result, null, 2));
        else cliLog(`${options.dryRun ? 'Would ' : ''}${action} ${id}.`);
      } catch (error) { handleCommandError(error, `backup ${action}`); }
    });
  }
}

function selectScope(options: { project?: boolean; global?: boolean }): 'project' | 'global' {
  if (options.project && options.global) throw new SkillctlError('Choose --project or --global', 'INVALID_OPTIONS', 2);
  return options.global ? 'global' : 'project';
}

async function confirmDangerous(message: string, options: { dryRun?: boolean; yes?: boolean; json?: boolean }): Promise<void> {
  if (options.dryRun || options.yes) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY || options.json) throw new SkillctlError('Non-interactive backup changes require --yes', 'CONFIRMATION_REQUIRED', 2);
  const answer = await prompts.confirm({ message });
  if (prompts.isCancel(answer) || !answer) throw new SkillctlError('Backup operation cancelled', 'CANCELLED', 1);
}
