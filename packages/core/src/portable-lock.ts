import type { LockfileEntry, SkillLockfile, SkillManifest } from './types.js';

const PORTABLE_CANONICAL_PREFIX = '~/.skillctl/skills/';

export function isPortableCanonicalPath(path: string): boolean {
  return path.startsWith(PORTABLE_CANONICAL_PREFIX);
}

export function isPortableSpecifier(spec: string): boolean {
  if (/^(github:|skills\.sh\/|npm:)/.test(spec)) return true;
  if (spec.startsWith('local:imported/')) return true;
  if (spec.startsWith('file:./') || spec.startsWith('file:../')) return true;
  return false;
}

function checkEntry(name: string, field: string, value: string, warnings: string[]): void {
  if (field === 'canonicalPath') {
    if (!isPortableCanonicalPath(value)) {
      warnings.push(`${name}: lock ${field} is not portable (${value}) — run skillctl install to rewrite`);
    }
    return;
  }
  if (!isPortableSpecifier(value)) {
    warnings.push(`${name}: lock ${field} is not portable (${value}) — run skillctl install to rewrite`);
  }
}

/** Detect machine-local paths in manifest/lock that should be rewritten for git portability. */
export function findPortablePathWarnings(
  lock: SkillLockfile,
  manifest?: SkillManifest | null
): string[] {
  const warnings: string[] = [];

  for (const [name, entry] of Object.entries(lock.skills)) {
    checkEntry(name, 'specifier', entry.specifier, warnings);
    checkEntry(name, 'resolved', entry.resolved, warnings);
    checkEntry(name, 'canonicalPath', entry.canonicalPath, warnings);
  }

  const deps = manifest?.agentSkills?.dependencies || {};
  for (const [name, spec] of Object.entries(deps)) {
    if (!isPortableSpecifier(spec)) {
      warnings.push(`${name}: manifest specifier is not portable (${spec}) — run skillctl add/install to rewrite`);
    }
  }

  return warnings;
}