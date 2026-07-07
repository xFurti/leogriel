import type { Command } from 'commander';
import { resolve } from 'node:path';
import { validateSkillDir, auditExitCode } from '@skillctl/security';
import { handleCommandError } from '../lib/errors.js';

export function registerSkill(program: Command): void {
  const skillCmd = program.command('skill').description('Utilities for Agent Skill directories');

  skillCmd
    .command('validate [path]')
    .description('Validate a SKILL.md directory (frontmatter, scripts, size)')
    .option('--json', 'machine-readable output')
    .option('--strict', 'treat warnings as errors (exit 2)')
    .action(async (pathArg, options) => {
      try {
        const skillPath = resolve(process.cwd(), pathArg || 'skills/skillctl');
        const report = await validateSkillDir(skillPath);

        if (options.json) {
          console.log(JSON.stringify({ ...report, path: skillPath }, null, 2));
          process.exitCode = auditExitCode(report, options.strict);
          return;
        }

        console.log(`skillctl skill validate — ${skillPath}`);
        console.log(`Status: ${report.status} (scanned ${report.scanned})`);
        for (const f of report.findings) {
          console.log(`  [${f.severity}] ${f.rule}: ${f.message}`);
        }
        if (report.findings.length === 0) console.log('  No issues found.');

        process.exitCode = auditExitCode(report, options.strict);
      } catch (err) {
        handleCommandError(err, 'skill validate');
      }
    });
}