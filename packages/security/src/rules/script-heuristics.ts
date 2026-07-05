import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditFinding } from '../types.js';

const SUSPICIOUS = [
  /\brm\s+-rf\s+\//,
  /\bcurl\b.*\|\s*(ba)?sh/,
  /\bwget\b/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /child_process/,
];

async function walkScripts(dir: string, out: string[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.')) await walkScripts(p, out);
      else if (e.isFile() && /\.(sh|bash|py|js|ts|mjs)$/i.test(e.name)) out.push(p);
    }
  } catch {
    // ignore
  }
}

export async function checkScriptHeuristics(skillName: string, canonicalPath: string): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];
  const scriptsDir = join(canonicalPath, 'scripts');
  const files: string[] = [];
  await walkScripts(scriptsDir, files);

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf8');
      for (const pattern of SUSPICIOUS) {
        if (pattern.test(content)) {
          findings.push({
            rule: 'script-heuristics',
            severity: 'warning',
            skill: skillName,
            message: `Suspicious pattern in script: ${pattern.source}`,
            path: file,
          });
        }
      }
    } catch {
      // unreadable
    }
  }
  return findings;
}