import { cliLog } from '../lib/output.js';
import type { Command } from 'commander';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  findLockReproducibilityWarnings,
  findPortablePathWarnings,
  getGlobalLeogrielRoot,
  getGlobalSkillsStore,
  getProjectSkillsStore,
  getRegisteredAdapters,
  loadConfig,
  lockToSkillTargets,
  requireLeogrielProject,
} from '@leogriel/core';
import { loadManifest } from '@leogriel/manifest';
import { loadLockfile } from '@leogriel/lockfile';
import { scanCoexistence, getEnabledAdapters, inspectSkillTargets, syncSkillsToAgents } from '@leogriel/adapters';
import { runAudit, auditExitCode } from '@leogriel/security';
import { withOperationLocks } from '@leogriel/project-state';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose environment, links, config, coexistence')
    .option('--json', 'output JSON')
    .option('--fix', 're-sync agent links from lock')
    .option('-g, --global', 'diagnose the global skill installation')
    .action(async (options) => {
      const cwd = options.global ? getGlobalLeogrielRoot() : await requireLeogrielProject();
      const store = options.global ? getGlobalSkillsStore() : getProjectSkillsStore(cwd);
      const [config, manifest, lock, coexist, enabledAdapters, audit] = await Promise.all([
        loadConfig(),
        loadManifest(cwd),
        loadLockfile(cwd),
        options.global ? Promise.resolve({ detected: false, details: [], paths: [], recommendations: [] }) : scanCoexistence(cwd),
        getEnabledAdapters(),
        runAudit(cwd, { store }),
      ]);

      const issues: string[] = [];
      const warnings: string[] = [];
      const info: string[] = [];

      if (!manifest && !options.global) issues.push('No agent-skills.json in project');
      if (!lock) info.push('No agent-skills.lock yet (run install after adding skills)');
      if (coexist.detected) info.push('Coexistence markers detected');

      if (lock) {
        warnings.push(...findPortablePathWarnings(lock, manifest));
        warnings.push(...findLockReproducibilityWarnings(lock));
      }
      warnings.push(...await findStateWarnings(cwd, store));

      let targetInspection = lock
        ? await inspectSkillTargets(await lockToSkillTargets(lock, { store }), {
            scope: options.global ? 'global' : 'project',
            cwd,
          })
        : null;

      for (const f of audit.findings.filter((x) => x.severity === 'error')) {
        issues.push(`[audit] ${f.skill}: ${f.message}`);
      }

      if (options.fix && lock) {
        const res = await withOperationLocks(
          { cwd, store },
          async () => syncSkillsToAgents(await lockToSkillTargets(lock, { store }), {
            scope: options.global ? 'global' : 'project',
            cwd,
          })
        );
        info.push(`--fix: re-synced ${res.synced} targets`);
        targetInspection = await inspectSkillTargets(await lockToSkillTargets(lock, { store }), {
          scope: options.global ? 'global' : 'project',
          cwd,
        });
      }

      const targetStates = countTargetStates(targetInspection?.actions || []);
      if (targetStates.missing || targetStates['managed-stale']) {
        warnings.push(
          `agent-targets: ${targetStates.missing} missing and ${targetStates['managed-stale']} managed-stale target(s); run leogriel doctor --fix`,
        );
      }
      if (targetStates.unmanaged || targetStates.failed) {
        warnings.push(
          `agent-targets: ${targetStates.unmanaged} unmanaged and ${targetStates.failed} failed target(s); run leogriel sync --dry-run for details`,
        );
      }

      const report = {
        status: issues.length
          ? 'issues'
          : warnings.length || audit.status === 'warnings'
            ? 'warnings'
            : 'ok',
        config: { store, defaultMode: config.defaultMode },
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
        targets: targetInspection ? {
          stateCounts: targetStates,
          counts: targetInspection.counts,
          actions: targetInspection.actions,
        } : null,
      };

      if (options.json) {
        cliLog(JSON.stringify(report, null, 2));
        process.exitCode = issues.length ? 2 : warnings.length ? 1 : auditExitCode(audit);
        return;
      }

      cliLog('leogriel doctor');
      cliLog('Config store:', report.config.store);
      cliLog('Manifest:', report.manifestPresent ? 'present' : 'missing');
      cliLog('Lockfile:', report.lockPresent ? 'present' : 'missing');
      cliLog('Adapters enabled:', report.adapters.enabled.join(', ') || '(none)');
      if (coexist.detected) {
        cliLog('Coexistence:', coexist.details.join('; '));
        if (coexist.recommendations.length) cliLog('Recommendations:', coexist.recommendations.join('; '));
      }
      if (audit.findings.length) {
        cliLog(`Audit: ${audit.findings.length} finding(s) across ${audit.scanned} skill(s)`);
      }
      if (issues.length) cliLog('Issues:', issues.join('; '));
      if (warnings.length) cliLog('Warnings:', warnings.join('; '));
      if (info.length) cliLog('Info:', info.join('; '));
      if (targetInspection) {
        cliLog(
          'Targets:',
          `current=${targetStates.current}, missing=${targetStates.missing}, managed-stale=${targetStates['managed-stale']}, unmanaged=${targetStates.unmanaged}, failed=${targetStates.failed}`,
        );
      }

      process.exitCode = issues.length ? 2 : warnings.length ? 1 : auditExitCode(audit);
    });
}

async function findStateWarnings(cwd: string, store: string): Promise<string[]> {
  const warnings: string[] = [];
  if (await exists(join(cwd, '.leogriel-transaction.json'))) {
    warnings.push('transaction-journal: interrupted project update detected; the next mutating command will recover it');
  }
  for (const path of [join(cwd, '.leogriel-operation.lock'), join(store, '.leogriel-store.lock')]) {
    const value = await stat(path).catch(() => null);
    if (value && Date.now() - value.mtimeMs > 30_000) warnings.push(`stale-lock: ${path}`);
  }
  return warnings;
}

async function exists(path: string): Promise<boolean> {
  return !!await stat(path).catch(() => null);
}

function countTargetStates(
  actions: Array<{ state?: 'missing' | 'current' | 'managed-stale' | 'unmanaged' | 'failed' }>,
): Record<'missing' | 'current' | 'managed-stale' | 'unmanaged' | 'failed', number> {
  const counts = { missing: 0, current: 0, 'managed-stale': 0, unmanaged: 0, failed: 0 };
  for (const action of actions) {
    if (action.state) counts[action.state]++;
  }
  return counts;
}
