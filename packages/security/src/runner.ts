import { loadLockfile } from '@skillctl/lockfile';
import type { AuditReport, AuditFinding } from './types.js';
import { checkIntegrityDrift } from './rules/integrity-drift.js';
import { checkScriptHeuristics } from './rules/script-heuristics.js';
import { checkNameDirMatch } from './rules/name-dir-match.js';
import { checkPathTraversal } from './rules/path-traversal.js';
import { checkSizeLimits } from './rules/size-limits.js';

export async function runAudit(cwd = process.cwd()): Promise<AuditReport> {
  const lock = await loadLockfile(cwd);
  if (!lock || Object.keys(lock.skills).length === 0) {
    return { status: 'ok', findings: [], scanned: 0 };
  }

  const findings: AuditFinding[] = [];
  findings.push(...(await checkIntegrityDrift(lock)));

  for (const [name, entry] of Object.entries(lock.skills)) {
    findings.push(...(await checkNameDirMatch(name, entry.canonicalPath)));
    findings.push(...(await checkScriptHeuristics(name, entry.canonicalPath)));
    findings.push(...(await checkPathTraversal(name, entry.canonicalPath)));
    findings.push(...(await checkSizeLimits(name, entry.canonicalPath)));
  }

  const hasError = findings.some((f) => f.severity === 'error');
  const hasWarning = findings.some((f) => f.severity === 'warning');

  return {
    status: hasError ? 'errors' : hasWarning ? 'warnings' : 'ok',
    findings,
    scanned: Object.keys(lock.skills).length,
  };
}

export function auditExitCode(report: AuditReport, strict = false): number {
  if (report.status === 'errors') return 2;
  if (strict && report.status === 'warnings') return 2;
  if (report.status === 'warnings') return 1;
  return 0;
}