import { basename, isAbsolute, relative, resolve } from 'node:path';
import { canonicalizeName } from './names.js';
import { importedSpecifier, parseImportedSpecifier } from './specifiers.js';
import type { ResolvedSource } from './types.js';

export interface NormalizeLocalSpecifierResult {
  /** Portable specifier for manifest/lock */
  portable: string;
  /** Absolute path on disk for fetch/materialize */
  absPath: string;
  /** Skill name derived from the path */
  name: string;
  /** True when the path lies outside the project cwd */
  outsideProject: boolean;
}

export function parseLocalSpecifierPath(spec: string): string {
  let localPath = spec;
  if (spec.startsWith('file:')) localPath = spec.slice(5);
  else if (spec.startsWith('local:')) localPath = spec.slice(6);
  return localPath;
}

/** Normalize a local/file specifier to a portable form for manifest + lock. */
export function normalizeLocalSpecifier(spec: string, cwd: string): NormalizeLocalSpecifierResult {
  const importedName = parseImportedSpecifier(spec);
  if (importedName) {
    return {
      portable: importedSpecifier(importedName),
      absPath: '',
      name: importedName,
      outsideProject: false,
    };
  }

  const localPath = parseLocalSpecifierPath(spec);
  const absPath = resolve(cwd, localPath);
  const name = canonicalizeName(basename(absPath));
  const rel = relative(cwd, absPath);

  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    const normalized = rel.replace(/\\/g, '/');
    const portable = normalized.startsWith('.') ? `file:${normalized}` : `file:./${normalized}`;
    return { portable, absPath, name, outsideProject: false };
  }

  return {
    portable: importedSpecifier(name),
    absPath,
    name,
    outsideProject: true,
  };
}

/** Manifest/lock specifier after resolution (never stores machine-local absolute paths). */
export function portableSpecifierForResolved(
  spec: string,
  resolved: Pick<ResolvedSource, 'sourceType' | 'resolved'>,
  cwd: string
): string {
  if (resolved.sourceType === 'local') {
    return normalizeLocalSpecifier(spec, cwd).portable;
  }
  if (!/^(github:|npm:|skills\.sh\/|file:|local:imported\/)/.test(spec)) {
    if (resolved.sourceType === 'github') return `github:${spec}`;
    if (resolved.sourceType === 'npm') return `npm:${spec}`;
  }
  return spec;
}