import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

function extractDesc(yaml: string): string | undefined {
  const m = yaml.match(/(?:^|\n)\s*description:\s*["']?([^"'\n]+)/i);
  return m ? m[1].trim() : undefined;
}

export async function parseSkillFrontmatterAsync(skillDir: string): Promise<{ name?: string; description?: string }> {
  const candidates = ['SKILL.md', 'skill.md'];
  for (const f of candidates) {
    const p = join(skillDir, f);
    try {
      const content = await readFile(p, 'utf8');
      const match = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
      if (match?.[1]) {
        const yamlLike = match[1];
        const nameMatch = yamlLike.match(/(?:^|\n)\s*name:\s*["']?([^"'\n#]+)["']?/i);
        if (nameMatch) {
          return { name: nameMatch[1].trim(), description: extractDesc(yamlLike) };
        }
      }
      const looseName = content.match(/name:\s*["']?([^"'\n]+)/i);
      if (looseName) return { name: looseName[1].trim() };
    } catch {
      // continue
    }
  }
  return { name: basename(skillDir) };
}