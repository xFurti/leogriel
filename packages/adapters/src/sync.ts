/**
 * Minimal sync wiring for PR6.
 * syncSkillsToAgents: for each enabled adapter, for each provided skill (name + canonical),
 * ensure the project+global targets via adapter.ensureTarget using LinkManager under the hood.
 *
 * Called by future sync command (PR7). For now used in tests and can be called manually.
 * Coexistence scan is separate.
 */

import type { AgentAdapter } from '@skillctl/core';
import { getEnabledAdapters } from './index.js';
import { linkManager } from '@skillctl/link-manager';
import { loadConfig } from '@skillctl/core';
import { join } from 'node:path';

export interface SkillTarget {
  name: string;
  canonicalPath: string;
}

export interface SyncOptions {
  mode?: 'symlink' | 'copy' | 'junction';
  dryRun?: boolean;
  adapters?: AgentAdapter[]; // override for test
}

/**
 * Sync given skills (from lock or manifest) to all enabled agent targets.
 * For each adapter:
 *   - detect if relevant (or force)
 *   - for each global path + project path: ensure target = <path>/<skillName>
 */
export async function syncSkillsToAgents(
  skills: SkillTarget[],
  options: SyncOptions = {}
): Promise<{ synced: number; adaptersUsed: string[]; notes: string[] }> {
  const cfg = await loadConfig();
  const mode = options.mode || cfg.defaultMode;
  const adapters = options.adapters || (await getEnabledAdapters(cfg));

  const notes: string[] = [];
  let synced = 0;
  const used: string[] = [];

  for (const adapter of adapters) {
    const relevant = await adapter.detect();
    if (!relevant && !options.adapters) {
      notes.push(`Skipped ${adapter.name} (not detected)`);
      continue;
    }
    used.push(adapter.id);

    const paths = [...adapter.projectPaths, ...adapter.globalPaths];
    for (const basePath of paths) {
      for (const skill of skills) {
        // targetPath for skill is base/skillsName
        // Note: if basePath already ends with skill? caller controls, here we append always for skills root
        const target = join(basePath, skill.name);  // but wait: projectPaths are like '.claude/skills' , join(cwd? No:
        // Actually adapters' projectPaths are relative, so sync caller must resolve full paths.
        // For this impl we leave as relative join; real caller resolves with cwd/homedir.
        // To make functional, here we resolve minimally: if starts with . use cwd, else assume full.
        const resolvedBase = basePath.startsWith('.') ? join(process.cwd(), basePath) : basePath;
        const fullTarget = join(resolvedBase, skill.name);
        try {
          await adapter.ensureTarget(skill.name, fullTarget, skill.canonicalPath, mode as any);
          synced++;
        } catch (e: any) {
          notes.push(`Failed ensure for ${skill.name} on ${adapter.id}: ${e.message}`);
        }
      }
    }
  }

  return { synced, adaptersUsed: used, notes };
}

// Re-export for consumers
export { getEnabledAdapters, scanCoexistence } from './index.js';
