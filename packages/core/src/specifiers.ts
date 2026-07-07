import { canonicalizeName } from './names.js';

/** Manifest specifier for skills migrated into the canonical store. */
export function importedSpecifier(name: string): string {
  return `local:imported/${canonicalizeName(name)}`;
}

const IMPORTED_PREFIX = 'local:imported/';

export function isImportedSpecifier(spec: string): boolean {
  return spec.startsWith(IMPORTED_PREFIX);
}

export function parseImportedSpecifier(spec: string): string | null {
  if (!isImportedSpecifier(spec)) return null;
  const name = spec.slice(IMPORTED_PREFIX.length);
  return name ? canonicalizeName(name) : null;
}