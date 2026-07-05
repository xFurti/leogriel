import { stat } from 'node:fs/promises';
import type { SkillLockfile } from '@skillctl/core';
import { computeDirIntegrity } from '@skillctl/core';
import type { AuditFinding } from '../types.js';

export async function checkIntegrityDrift(lock: SkillLockfile): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    try {
      await stat(entry.canonicalPath);
      const integrity = await computeDirIntegrity(entry.canonicalPath);
      if (integrity !== entry.integrity) {
        findings.push({
          rule: 'integrity-drift',
          severity: 'error',
          skill: name,
          message: `Canonical integrity mismatch (lock: ${entry.integrity.slice(0, 24)}...)`,
          path: entry.canonicalPath,
        });
      }
    } catch {
      findings.push({
        rule: 'integrity-drift',
        severity: 'error',
        skill: name,
        message: 'Canonical path missing',
        path: entry.canonicalPath,
      });
    }
  }
  return findings;
}