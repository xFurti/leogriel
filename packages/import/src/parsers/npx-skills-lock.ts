import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface NpxSkillEntry {
  name: string;
  source?: string;
  ref?: string;
  skillFolderHash?: string;
  installedAt?: string;
  localPath?: string;
}

/** Parse vercel-labs/npx skills skills-lock.json (tolerant schema). */
export async function parseNpxSkillsLock(lockPath: string): Promise<NpxSkillEntry[]> {
  const raw = await readFile(lockPath, 'utf8');
  const json = JSON.parse(raw);
  const entries: NpxSkillEntry[] = [];

  const skills = json.skills || json;
  if (Array.isArray(skills)) {
    for (const s of skills) {
      entries.push({
        name: s.name || s.skillName,
        source: s.source || s.specifier || s.repo,
        ref: s.ref || s.version || s.commit,
        skillFolderHash: s.skillFolderHash || s.hash || s.integrity,
        installedAt: s.installedAt,
      });
    }
  } else if (typeof skills === 'object') {
    for (const [name, val] of Object.entries(skills)) {
      const v = val as Record<string, string>;
      entries.push({
        name,
        source: v.source || v.specifier || v.repo,
        ref: v.ref || v.version,
        skillFolderHash: v.skillFolderHash || v.hash,
        installedAt: v.installedAt,
      });
    }
  }

  return entries.filter((e) => e.name);
}

export async function findNpxLock(cwd: string): Promise<string | null> {
  const p = join(cwd, 'skills-lock.json');
  try {
    await readFile(p, 'utf8');
    return p;
  } catch {
    return null;
  }
}