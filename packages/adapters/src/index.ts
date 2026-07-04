/**
 * @skillctl/adapters entrypoint.
 * Exports the first three adapters + base helpers.
 * Minimal registration: array of adapters + getEnabledAdapters using config.
 * Coexistence scan stub (for doctor later).
 */

import type { AgentAdapter, SkillctlConfig } from '@skillctl/core';
import { loadConfig, registerAdapter } from '@skillctl/core';
import { claudeAdapter } from './claude/index.js';
import { cursorAdapter } from './cursor/index.js';
import { opencodeAdapter } from './opencode/index.js';
import { pathExists } from './base/index.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Auto-register on import (minimal wiring per PR6)
registerAdapter(claudeAdapter);
registerAdapter(cursorAdapter);
registerAdapter(opencodeAdapter);

export { claudeAdapter, cursorAdapter, opencodeAdapter };
export * from './base/index.js';
export type { AgentAdapter };

// All known for this PR
export const allAdapters: AgentAdapter[] = [
  claudeAdapter,
  cursorAdapter,
  opencodeAdapter,
];

/**
 * Minimal registration: return enabled adapters from config.agents (or all if no config).
 * Future PRs: dynamic plugin registration.
 */
export async function getEnabledAdapters(config?: SkillctlConfig): Promise<AgentAdapter[]> {
  const cfg = config || (await loadConfig());
  const enabled = cfg.agents || {};
  return allAdapters.filter((a) => enabled[a.id] !== false);
}

/**
 * Coexistence detection stub (scans for signs of npx skills / python skillctl / other managers).
 * Used by doctor (PR7). Returns simple report object.
 * Scans:
 *  - .agents/skills (universal target, also used by npx skills)
 *  - ~/.skillctl (our store or python's ~/.skillctl/repos )
 *  - skills-lock.json (vercel/npx format)
 *  - npx skills presence heuristic (lock or bin)
 *  - other .skillctl markers
 */
export interface CoexistenceReport {
  detected: boolean;
  details: string[];
  paths: string[];
  recommendations: string[];
}

export async function scanCoexistence(cwd = process.cwd()): Promise<CoexistenceReport> {
  const details: string[] = [];
  const paths: string[] = [];
  const recs: string[] = [];

  // project level
  const agentsSkills = join(cwd, '.agents', 'skills');
  if (await pathExists(agentsSkills)) {
    details.push('Found .agents/skills (common universal layout used by npx skills and many agents)');
    paths.push(agentsSkills);
    recs.push('Consider `skillctl import --from-npx` (future) or run sync to adopt into canonical');
  }

  // global ~/.skillctl (could be python skillctl or ours)
  const skillctlHome = join(homedir(), '.skillctl');
  if (await pathExists(skillctlHome)) {
    details.push('Found ~/.skillctl (may be python skillctl or skillctl canonical store)');
    paths.push(skillctlHome);
    recs.push('Run doctor for migration guidance; avoid managing same skills in two tools');
  }

  // npx skills lock (vercel format)
  const npxLock = join(cwd, 'skills-lock.json');
  if (await pathExists(npxLock)) {
    details.push('Found skills-lock.json (npx skills / vercel-labs format)');
    paths.push(npxLock);
    recs.push('Detected prior npx skills usage; coexistence supported via adapters + import');
  }

  // global npx skillctl like markers or ~/.config etc (stubs)
  const npxGlobalHint = join(homedir(), '.local', 'share', 'skills'); // rough heuristic
  if (await pathExists(npxGlobalHint)) {
    details.push('Possible npx skills global data');
    paths.push(npxGlobalHint);
  }

  // Also scan for our own config as benign
  const ourConfig = join(homedir(), '.skillctl', 'config.json');
  if (await pathExists(ourConfig)) {
    details.push('skillctl config present (native)');
  }

  const detected = details.length > 0 || paths.length > 0;
  if (!detected) {
    details.push('No obvious coexistence markers found');
  } else if (recs.length === 0) {
    recs.push('Proceed; adapters will manage targets safely');
  }

  return {
    detected,
    details,
    paths,
    recommendations: recs,
  };
}

// Convenience: list of ids for config etc
export const ADAPTER_IDS = allAdapters.map((a) => a.id);

export * from './sync.js';
