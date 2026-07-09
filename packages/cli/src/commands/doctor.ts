import type { Command } from 'commander';
import { loadConfig, getRegisteredAdapters, lockToSkillTargets, findPortablePathWarnings } from '@skillctl/core';
import { loadManifest } from '@skillctl/manifest';
import { loadLockfile } from '@skillctl/lockfile';
import { scanCoexistence, getEnabledAdapters, syncSkillsToAgents } from '@skillctl/adapters';
import { runAudit, auditExitCode } from '@skillctl/security';
import { withOperationLocks } from '@skillctl/project-state';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose environment, links, config, coexistence')
    .option('--json', 'output JSON')
    .option('--fix', 're-sync agent links from lock')
    .action(async (options) => {
      const cwd = process.cwd();
      const [config, manifest, lock, coexist, enabledAdapters, audit] = await Promise.all([
        loadConfig(),
        loadManifest(cwd),
        loadLockfile(cwd),
        scanCoexistence(cwd),
        getEnabledAdapters(),
        runAudit(cwd),
      ]);

      const issues: string[] = [];
      const warnings: string[] = [];
      const info: string[] = [];

      if (!manifest) issues.push('No agent-skills.json in project');
      if (!lock) info.push('No agent-skills.lock yet (run install after adding skills)');
      if (coexist.detected) info.push('Coexistence markers detected');

      if (lock) {
        warnings.push(...findPortablePathWarnings(lock, manifest));
      }

      for (const f of audit.findings.filter((x) => x.severity === 'error')) {
        issues.push(`[audit] ${f.skill}: ${f.message}`);
      }

      if (options.fix && lock) {
        const res = await withOperationLocks(
          { cwd, store: config.store },
          async () => syncSkillsToAgents(await lockToSkillTargets(lock))
        );
        info.push(`--fix: re-synced ${res.synced} targets`);
      }

      const report = {
        status: issues.length
          ? 'issues'
          : warnings.length || audit.status === 'warnings'
            ? 'warnings'
            : 'ok',
        config: { store: config.store, defaultMode: config.defaultMode },
        manifestPresent: !!manifest,
        lockPresent: !!lock,
        issues,
        warnings,
        info,
        adapters: {
          registered: getRegisteredAdapters().map((a) => a.id),
          enabled: enabledAdapters.map((a) => a.id),
        },
        coexistence: coexist,
        auditSummary: { scanned: audit.scanned, findings: audit.findings.length },
      };

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = issues.length ? 2 : auditExitCode(audit);
        return;
      }

      console.log('skillctl doctor');
      console.log('Config store:', report.config.store);
      console.log('Manifest:', report.manifestPresent ? 'present' : 'missing');
      console.log('Lockfile:', report.lockPresent ? 'present' : 'missing');
      console.log('Adapters enabled:', report.adapters.enabled.join(', ') || '(none)');
      if (coexist.detected) {
        console.log('Coexistence:', coexist.details.join('; '));
        if (coexist.recommendations.length) console.log('Recommendations:', coexist.recommendations.join('; '));
      }
      if (audit.findings.length) {
        console.log(`Audit: ${audit.findings.length} finding(s) across ${audit.scanned} skill(s)`);
      }
      if (issues.length) console.log('Issues:', issues.join('; '));
      if (warnings.length) console.log('Warnings:', warnings.join('; '));
      if (info.length) console.log('Info:', info.join('; '));

      process.exitCode = issues.length ? 2 : warnings.length ? 1 : auditExitCode(audit);
    });
}
