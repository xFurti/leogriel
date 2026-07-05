import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalizeName } from '@skillctl/core';
import type { AuditFinding } from '../types.js';

export async function checkNameDirMatch(skillName: string, canonicalPath: string): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  for (const f of ['SKILL.md', 'skill.md']) {
    try {
      const content = await readFile(join(canonicalPath, f), 'utf8');
      const match = content.match(/(?:^|\n)\s*name:\s*["']?([^"'\n#]+)["']?/i);
      if (match) {
        const fmName = canonicalizeName(match[1].trim());
        const dirName = canonicalizeName(skillName);
        if (fmName !== dirName) {
          findings.push({
            rule: 'name-dir-match',
            severity: 'warning',
            skill: skillName,
            message: `SKILL.md name "${fmName}" does not match lock name "${dirName}"`,
            path: join(canonicalPath, f),
          });
        }
      }
      break;
    } catch {
      // try next
    }
  }
  return findings;
}