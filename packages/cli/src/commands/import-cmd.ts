import type { Command } from 'commander';
import { executeImport } from '@skillctl/import';
import { handleCommandError } from '../lib/errors.js';

export function registerImport(program: Command): void {
  const importCmd = program
    .command('import')
    .description('Import skills from npx skills or Python skillctl');

  importCmd
    .command('from-npx')
    .description('Migrate from npx skills (skills-lock.json / .agents/skills)')
    .option('--dry-run', 'show migration plan only')
    .option('--yes', 'skip confirmation prompts')
    .option('--adopt', 'sync to agent targets after import')
    .option('--write-manifest', 'update agent-skills.json with imported specs')
    .action(async (options) => {
      try {
        const result = await executeImport({
          source: 'npx',
          dryRun: options.dryRun,
          yes: options.yes,
          adopt: options.adopt,
          writeManifest: options.writeManifest,
        });

        if (options.dryRun) {
          console.log('Migration plan:');
          for (const item of result.plan) {
            console.log(`  ${item.name}: ${item.action}${item.specifier ? ` (${item.specifier})` : ''}${item.note ? ` — ${item.note}` : ''}`);
          }
          return;
        }

        console.log(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.skipped.length) console.log(`Skipped: ${result.skipped.join(', ')}`);
        if (result.errors.length) {
          console.error('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });

  importCmd
    .command('from-skillctl')
    .description('Migrate from Python skillctl (~/.skillctl/repos)')
    .option('--dry-run', 'show migration plan only')
    .option('--adopt', 'sync to agent targets after import')
    .option('--write-manifest', 'update agent-skills.json')
    .action(async (options) => {
      try {
        const result = await executeImport({
          source: 'python-skillctl',
          dryRun: options.dryRun,
          adopt: options.adopt,
          writeManifest: options.writeManifest,
        });

        if (options.dryRun) {
          console.log('Migration plan:');
          for (const item of result.plan) {
            console.log(`  ${item.name}: ${item.action}${item.localPath ? ` (${item.localPath})` : ''}`);
          }
          return;
        }

        console.log(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.errors.length) {
          console.error('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });
}