import { cliLog, cliError, cliWarn } from '../lib/output.js';
import type { Command } from 'commander';
import { executeImport, planImportFromProject, type ImportPlanItem } from '@leogriel/import';
import { handleCommandError, LeogrielError } from '../lib/errors.js';
import { choose, confirm, isInteractive } from '../lib/prompt.js';

function printPlan(plan: ImportPlanItem[]): void {
  for (const item of plan) {
    const extra = [
      item.specifier ? `spec=${item.specifier}` : '',
      item.localPath ? `path=${item.localPath}` : '',
      item.originalPath ? `from=${item.originalPath}` : '',
      item.note ? item.note : '',
    ]
      .filter(Boolean)
      .join(' — ');
    cliLog(`  ${item.name}: ${item.action}${extra ? ` (${extra})` : ''}`);
  }
}

function printDiscoverySummary(discovered: Awaited<ReturnType<typeof planImportFromProject>>['discovered']): void {
  if (!discovered.sources.length) {
    cliLog('No agent skill directories with skills found in this project.');
    return;
  }
  cliLog('Discovered skill sources in project:');
  for (const src of discovered.sources) {
    cliLog(`  ${src.projectPath} (${src.adapterName}) → ${src.skills.length} skill(s)`);
  }
}

export function registerImport(program: Command): void {
  const importCmd = program
    .command('import')
    .description('Import all skills discovered in project agent directories')
    .option('--dry-run', 'show import plan only')
    .option('--select', 'interactively select skills to import')
    .option('--interactive', 'interactively resolve conflicting skills')
    .option('--sources <list>', 'comma-separated adapter ids')
    .option('--sync', 'sync agent links after import')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      try {
        await importProject(options);
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });

  importCmd
    .command('from-project')
    .description('Import skills from detected agent directories (.codex/skills, .claude/skills, .agents/skills, ...)')
    .option('--json', 'machine-readable output')
    .option('--dry-run', 'show migration plan only')
    .option('--yes, -y', 'skip confirmation prompts')
    .option('--sync', 'sync agent links after import')
    .option('--no-manifest', 'update lock only (do not write agent-skills.json)')
    .option('--lock-only', 'alias for --no-manifest')
    .option('--sources <list>', 'comma-separated adapter ids (codex,claude-code,cursor,...)')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const sources = options.sources
          ? String(options.sources)
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : undefined;

        const { plan, discovered } = await planImportFromProject(cwd, { sources });

        if (options.dryRun) {
          printDiscoverySummary(discovered);
          cliLog('Migration plan:');
          printPlan(plan);
          return;
        }

        if (!discovered.sources.length) {
          cliLog('No agent skill directories with skills found in this project.');
          return;
        }

        printDiscoverySummary(discovered);

        if (!options.yes) {
          const proceed = await confirm('Import these skills into the canonical store?', true);
          if (!proceed) {
            cliLog('Import cancelled.');
            return;
          }
        }

        const result = await executeImport({
          source: 'project',
          cwd,
          yes: options.yes,
          sync: options.sync,
          lockOnly: options.lockOnly || options.noManifest,
          sources,
        });

        cliLog(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.skipped.length) cliLog(`Skipped: ${result.skipped.join(', ')}`);
        if (result.errors.length) {
          cliError('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
        if (result.imported.length && !options.sync) {
          cliLog('Manifest and lock updated. Run `leogriel sync` to refresh agent links.');
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });

  importCmd
    .command('from-npx')
    .description('Migrate from npx skills (skills-lock.json / .agents/skills)')
    .option('--json', 'machine-readable output')
    .option('--dry-run', 'show migration plan only')
    .option('--yes', 'skip confirmation prompts')
    .option('--sync', 'sync agent links after import')
    .option('--adopt', 'deprecated alias for --sync')
    .option('--write-manifest', 'update agent-skills.json with imported specs')
    .action(async (options) => {
      try {
        const result = await executeImport({
          source: 'npx',
          dryRun: options.dryRun,
          yes: options.yes,
          sync: options.sync || options.adopt,
          writeManifest: options.writeManifest,
        });

        if (options.dryRun) {
          cliLog('Migration plan:');
          printPlan(result.plan);
          return;
        }

        cliLog(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.skipped.length) cliLog(`Skipped: ${result.skipped.join(', ')}`);
        if (result.errors.length) {
          cliError('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });

  importCmd
    .command('from-skillctl')
    .description('Migrate from legacy Python skillctl (~/.skillctl/repos)')
    .option('--json', 'machine-readable output')
    .option('--dry-run', 'show migration plan only')
    .option('--sync', 'sync agent links after import')
    .option('--adopt', 'deprecated alias for --sync')
    .option('--write-manifest', 'update agent-skills.json')
    .action(async (options) => {
      try {
        const result = await executeImport({
          source: 'python-skillctl',
          dryRun: options.dryRun,
          sync: options.sync || options.adopt,
          writeManifest: options.writeManifest,
        });

        if (options.dryRun) {
          cliLog('Migration plan:');
          printPlan(result.plan);
          return;
        }

        cliLog(`Imported: ${result.imported.join(', ') || '(none)'}`);
        if (result.errors.length) {
          cliError('Errors:', result.errors.join('; '));
          process.exitCode = 1;
        }
      } catch (err) {
        handleCommandError(err, 'import');
      }
    });
}

async function importProject(options: {
  dryRun?: boolean;
  select?: boolean;
  interactive?: boolean;
  sources?: string;
  sync?: boolean;
  json?: boolean;
  yes?: boolean;
  lockOnly?: boolean;
  noManifest?: boolean;
}): Promise<void> {
  if (options.json && (options.select || options.interactive)) {
    throw new LeogrielError(
      '`leogriel import --json` cannot be combined with interactive selection',
      'INVALID_OPTIONS',
      2,
    );
  }
  const cwd = process.cwd();
  const sources = options.sources
    ? String(options.sources).split(',').map((value) => value.trim()).filter(Boolean)
    : undefined;
  let { plan, discovered } = await planImportFromProject(cwd, { sources });
  const conflictChoices: Record<string, string> = {};

  const conflicts = discovered.deduped.filter((skill) => skill.action === 'skip-conflict');
  if (conflicts.length && options.interactive) {
    if (!isInteractive()) throw new Error('`leogriel import --interactive` requires an interactive terminal.');
    for (const conflict of conflicts) {
      const index = await choose(
        `Conflicting contents found for "${conflict.name}". Choose which copy to import:`,
        conflict.occurrences.map((occurrence) => `${occurrence.adapterName}: ${occurrence.relativePath}`)
      );
      conflictChoices[conflict.name] = conflict.occurrences[index].localPath;
    }
    ({ plan, discovered } = await planImportFromProject(cwd, { sources, conflictChoices }));
  }

  if (options.dryRun) {
    if (options.json) {
      cliLog(JSON.stringify({ status: 'planned', plan, discovered }));
      return;
    }
    printDiscoverySummary(discovered);
    cliLog('Import plan:');
    printPlan(plan);
    return;
  }
  if (!discovered.sources.length) {
    if (options.json) cliLog(JSON.stringify({ status: 'empty', plan, discovered }));
    else printDiscoverySummary(discovered);
    return;
  }

  if (!options.json) printDiscoverySummary(discovered);

  let selectedNames: string[] | undefined;
  if (options.select) {
    if (!isInteractive()) throw new Error('`leogriel import --select` requires an interactive terminal.');
    selectedNames = [];
    for (const item of plan.filter((candidate) => !candidate.action.startsWith('skip-'))) {
      if (await confirm(`Import ${item.name}?`, true)) selectedNames.push(item.name);
    }
  }

  const result = await executeImport({
    source: 'project',
    cwd,
    sync: options.sync,
    lockOnly: options.lockOnly || options.noManifest,
    sources,
    selectedNames,
    conflictChoices,
  });
  if (options.json) {
    cliLog(JSON.stringify({
      status: result.errors.length ? 'warnings' : 'ok',
      ...result,
    }));
    if (result.errors.length) {
      cliWarn(`Import completed with ${result.errors.length} error(s).`);
      process.exitCode = 1;
    }
    return;
  }
  cliLog(`Imported: ${result.imported.join(', ') || '(none)'}`);
  if (result.skipped.length) cliLog(`Skipped: ${result.skipped.join(', ')}`);
  if (result.imported.length && !options.sync) cliLog('Run `leogriel sync` to refresh agent links.');
}
