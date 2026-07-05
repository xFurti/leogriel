import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { rm } from 'node:fs/promises';
import type { LockfileEntry, SkillLockfile } from './types.js';
import { computeDirIntegrity } from './fs.js';
import { canonicalizeName } from './names.js';

export interface InstallResult {
  installed: number;
  skipped: number;
  lock: SkillLockfile;
}

export async function needsInstall(entry: LockfileEntry): Promise<boolean> {
  try {
    await stat(entry.canonicalPath);
  } catch {
    return true;
  }
  try {
    const integrity = await computeDirIntegrity(entry.canonicalPath);
    return integrity !== entry.integrity;
  } catch {
    return true;
  }
}

export async function verifyLockIntegrity(lock: SkillLockfile): Promise<string[]> {
  const errors: string[] = [];
  for (const [name, entry] of Object.entries(lock.skills)) {
    try {
      await stat(entry.canonicalPath);
      const integrity = await computeDirIntegrity(entry.canonicalPath);
      if (integrity !== entry.integrity) {
        errors.push(`${name}: integrity mismatch (expected ${entry.integrity.slice(0, 20)}...)`);
      }
    } catch {
      errors.push(`${name}: canonical path missing (${entry.canonicalPath})`);
    }
  }
  return errors;
}

export function lockToSkillTargets(lock: SkillLockfile): Array<{ name: string; canonicalPath: string }> {
  return Object.values(lock.skills).map((e) => ({ name: e.name, canonicalPath: e.canonicalPath }));
}

export async function purgeCanonical(name: string): Promise<void> {
  const canonicalName = canonicalizeName(name);
  const p = join(homedir(), '.skillctl', 'skills', canonicalName);
  await rm(p, { recursive: true, force: true }).catch(() => {});
}