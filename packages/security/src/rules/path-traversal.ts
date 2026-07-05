import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditFinding } from '../types.js';

async function walkAll(dir: string, out: string[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.')) await walkAll(p, out);
      else if (e.isFile() && /\.(md|txt|sh|py|js|ts|json)$/i.test(e.name)) out.push(p);
    }
  } catch {
    // ignore
  }
}

export async function checkPathTraversal(skillName: string, canonicalPath: string): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const files: string[] = [];
  await walkAll(canonicalPath, files);

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      if (/\.\.\//.test(content) || /\/etc\/passwd/.test(content)) {
        findings.push({
          rule: 'path-traversal',
          severity: 'warning',
          skill: skillName,
          message: 'Possible path traversal reference in file content',
          path: file,
        });
      }
    } catch {
      // ignore
    }
  }
  return findings;
}