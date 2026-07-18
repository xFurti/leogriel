import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { hasSkillMd } from './skill-md.js';

export interface PythonSkillEntry {
  name: string;
  localPath: string;
  source?: string;
}

export async function scanPythonSkillctlRepos(): Promise<PythonSkillEntry[]> {
  const reposRoot = join(homedir(), '.skillctl', 'repos');
  const entries: PythonSkillEntry[] = [];

  try {
    const dirs = await readdir(reposRoot, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const repoPath = join(reposRoot, d.name);
      if (await hasSkillMd(repoPath)) {
        entries.push({ name: d.name, localPath: repoPath });
        continue;
      }
      const subs = await readdir(repoPath, { withFileTypes: true }).catch(() => []);
      for (const s of subs) {
        if (!s.isDirectory()) continue;
        const subPath = join(repoPath, s.name);
        if (await hasSkillMd(subPath)) {
          entries.push({ name: s.name, localPath: subPath, source: `file:${subPath}` });
        }
      }
    }
  } catch {
    // no repos dir
  }

  return entries;
}

export async function readPythonManifest(): Promise<Record<string, string>> {
  const manifestPath = join(homedir(), '.skillctl', 'manifest.json');
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const json = JSON.parse(raw);
    return json.skills || json.dependencies || json;
  } catch {
    return {};
  }
}
