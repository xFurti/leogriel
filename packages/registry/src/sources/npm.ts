import { rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import semver from 'semver';
import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { ensureDir, computeDirIntegrity } from '@skillctl/core';
import { canonicalizeName } from '../names.js';
import { locateSkillDir, packageJsonSkillHints } from '../locate-skill.js';
import { parseSkillFrontmatterAsync } from '../frontmatter.js';
import { httpsGet } from '../fetch/https.js';
import { fetchCachedBuffer, extractTarball, computeSha1 } from '../fetch/tarball.js';

export class NpmSource implements RegistrySource {
  readonly id = 'npm';

  match(spec: string): boolean {
    return spec.startsWith('npm:');
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    let pkg = spec;
    let range = 'latest';
    if (spec.startsWith('npm:')) pkg = spec.slice(4);

    const at = pkg.lastIndexOf('@');
    if (at > 0 && !pkg.slice(0, at).endsWith('@')) {
      range = pkg.slice(at + 1) || 'latest';
      pkg = pkg.slice(0, at);
    }
    if (options?.ref) range = options.ref;

    const metaUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
    let metaBuf: Buffer;
    try {
      metaBuf = await httpsGet(metaUrl, { Accept: 'application/json' });
    } catch (e) {
      throw new Error(`npm registry fetch failed for ${pkg}: ${(e as Error).message}`);
    }
    const meta = JSON.parse(metaBuf.toString('utf8'));
    if (meta.error) throw new Error(`npm error: ${meta.error}`);

    let version: string;
    if (range === 'latest' || !semver.validRange(range)) {
      version = meta['dist-tags']?.latest || Object.keys(meta.versions || {}).pop();
    } else {
      const best = semver.maxSatisfying(Object.keys(meta.versions || {}), range);
      if (!best) throw new Error(`No version satisfying ${range} for ${pkg}`);
      version = best;
    }

    const pkgInfo = meta.versions[version];
    if (!pkgInfo) throw new Error(`Version ${version} not in metadata`);

    return {
      name: canonicalizeName(pkg.split('/').pop() || pkg),
      resolved: `npm:${pkg}@${version}`,
      sourceType: 'npm',
      sourceId: this.id,
      originalSpec: spec,
      tarballUrl: pkgInfo.dist.tarball,
      tarballHash: pkgInfo.dist.shasum || pkgInfo.dist.integrity,
      ref: version,
    };
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    if (!resolved.tarballUrl) throw new Error('Invalid npm resolved, no tarballUrl');

    const dlKey = resolved.tarballHash
      ? `npm-${resolved.tarballHash}`
      : `npm-${createHash('sha256').update(resolved.tarballUrl).digest('hex').slice(0, 16)}`;

    const tarBuf = await fetchCachedBuffer(dlKey, resolved.tarballUrl);

    if (resolved.tarballHash && resolved.tarballHash.length === 40) {
      const got = computeSha1(tarBuf);
      if (got !== resolved.tarballHash) {
        throw new Error(`npm tarball integrity mismatch: expected ${resolved.tarballHash} got ${got}`);
      }
    }

    const tmpBase = join(tmpdir(), `skillctl-npm-${Date.now()}`);
    await ensureDir(tmpBase);
    await extractTarball(tarBuf, tmpBase, 1);

    const hints = await packageJsonSkillHints(tmpBase);
    const located = await locateSkillDir(tmpBase, { packageJsonHints: hints });
    await parseSkillFrontmatterAsync(located);

    await ensureDir(dest);
    await cp(located, dest, { recursive: true, force: true });
    await rm(tmpBase, { recursive: true, force: true }).catch(() => {});

    return { integrity: await computeDirIntegrity(dest) };
  }
}