import type { Command } from 'commander';
import { runAudit, auditExitCode } from '@skillctl/security';
import { handleCommandError } from '../lib/errors.js';

export function registerAudit(program: Command): void {
  program
    .command('audit')
    .description('Run security scanner on installed skills')
    .option('--json', 'machine-readable output')
    .option('--strict', 'treat warnings as errors (exit 2)')
    .action(async (options) => {
      try {
        const report = await runAudit(process.cwd());

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          process.exitCode = auditExitCode(report, options.strict);
          return;
        }

        console.log(`skillctl audit — scanned ${report.scanned} skill(s), status: ${report.status}`);
        for (const f of report.findings) {
          console.log(`  [${f.severity}] ${f.skill} (${f.rule}): ${f.message}`);
        }
        if (report.findings.length === 0) console.log('  No issues found.');

        process.exitCode = auditExitCode(report, options.strict);
      } catch (err) {
        handleCommandError(err, 'audit');
      }
    });
}