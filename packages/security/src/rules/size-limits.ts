import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditFinding } from '../types.js';

const MAX_SKILL_MD_LINES = 10_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function checkSizeLimits(skillName: string, canonicalPath: string): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  for (const f of ['SKILL.md', 'skill.md']) {
    try {
      const content = await readFile(join(canonicalPath, f), 'utf8');
      const lines = content.split('\n').length;
      if (lines > MAX_SKILL_MD_LINES) {
        findings.push({
          rule: 'size-limits',
          severity: 'warning',
          skill: skillName,
          message: `SKILL.md has ${lines} lines (>${MAX_SKILL_MD_LINES})`,
          path: join(canonicalPath, f),
        });
      }
      break;
    } catch {
      // continue
    }
  }

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        const st = await stat(p);
        if (st.size > MAX_FILE_BYTES) {
          findings.push({
            rule: 'size-limits',
            severity: 'warning',
            skill: skillName,
            message: `Large file ${(st.size / 1024 / 1024).toFixed(1)}MB`,
            path: p,
          });
        }
      }
    }
  }
  await walk(canonicalPath);
  return findings;
}