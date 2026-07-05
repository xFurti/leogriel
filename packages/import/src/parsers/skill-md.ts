import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function hasSkillMd(d: string): Promise<boolean> {
  for (const name of ['SKILL.md', 'skill.md']) {
    try {
      const st = await stat(join(d, name));
      if (st.isFile()) return true;
    } catch {
      // continue
    }
  }
  return false;
}