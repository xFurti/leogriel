/**
 * Adapter registration helpers (minimal for PR6).
 * Core defines the surface; concrete adapters live in @skillctl/adapters.
 * This allows future plugin registration without core depending on concrete pkgs.
 */
import type { AgentAdapter, SkillctlConfig } from './types.js';

const registeredAdapters: AgentAdapter[] = [];

export function registerAdapter(adapter: AgentAdapter): void {
  // last wins on id conflict (simple)
  const idx = registeredAdapters.findIndex((a) => a.id === adapter.id);
  if (idx >= 0) registeredAdapters[idx] = adapter;
  else registeredAdapters.push(adapter);
}

export function getRegisteredAdapters(): AgentAdapter[] {
  return [...registeredAdapters];
}

/**
 * Filter by enabled in config.
 */
export function getEnabledRegisteredAdapters(config: SkillctlConfig): AgentAdapter[] {
  return registeredAdapters.filter((a) => config.agents?.[a.id] !== false);
}

// Note: the concrete first adapters (claude etc) auto-register on import of @skillctl/adapters
// See adapters package for wiring + getEnabledAdapters (which may use this or its own).
