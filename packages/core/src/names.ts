/** Canonical skill name: lowercase, hyphen normalized (per design). */
export function canonicalizeName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}