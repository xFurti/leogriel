import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { archiveName, releasePackages } from './release-packages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function tarballIntegrity(buffer) {
  return `sha512-${createHash('sha512').update(buffer).digest('base64')}`;
}

export function publicationDecision(localIntegrity, remoteIntegrity) {
  if (!remoteIntegrity) return 'publish';
  if (remoteIntegrity === localIntegrity) return 'skip';
  return 'conflict';
}

export function resolveDistTag(version, override) {
  const tag = override?.trim() || (version.includes('-') ? 'next' : 'latest');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(tag)) throw new Error(`Invalid npm dist-tag: ${tag}`);
  if (/^v?\d+(?:\.\d+){1,2}(?:[-+].*)?$/i.test(tag)) throw new Error(`npm dist-tag cannot be a version: ${tag}`);
  return tag;
}

function npm(args, options = {}) {
  const result = spawnSync('npm', args, { cwd: root, encoding: 'utf8', ...options });
  return result;
}

function remoteIntegrity(name, version) {
  const result = npm(['view', `${name}@${version}`, 'dist.integrity', '--json']);
  if (result.status !== 0) {
    if (/E404|No match found|is not in this registry/i.test(`${result.stdout}\n${result.stderr}`)) return null;
    throw new Error(result.stderr || `npm view failed for ${name}@${version}`);
  }
  const parsed = JSON.parse(result.stdout || 'null');
  return typeof parsed === 'string' ? parsed : null;
}

async function waitForRemoteIntegrity(name, version, expected, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remote = remoteIntegrity(name, version);
    if (remote === expected) return;
    if (remote && remote !== expected) throw new Error(`Post-publish integrity conflict for ${name}@${version}`);
    if (attempt + 1 < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error(`Post-publish verification timed out for ${name}@${version}`);
}

export async function publishRelease(version, options = {}) {
  const dryRun = options.dryRun === true;
  const distTag = resolveDistTag(version, options.tag);
  const results = [];
  for (const shortName of releasePackages) {
    const name = `@skillctl/${shortName}`;
    const archive = join(root, 'artifacts', version, archiveName(shortName, version));
    const integrity = tarballIntegrity(await readFile(archive));
    const remote = remoteIntegrity(name, version);
    const decision = publicationDecision(integrity, remote);
    if (decision === 'conflict') {
      throw new Error(`${name}@${version} exists with different integrity`);
    }
    if (decision === 'publish' && !dryRun) {
      const result = npm(['publish', archive, '--access', 'public', '--tag', distTag], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`npm publish failed for ${name}@${version}`);
    }
    results.push({ name, version, integrity, decision, distTag });
  }
  if (!dryRun) {
    for (const result of results) {
      await waitForRemoteIntegrity(result.name, version, result.integrity);
    }
  }
  return results;
}

async function main() {
  const version = process.argv[2];
  if (!version) throw new Error('Usage: node scripts/publish-release.mjs <version> [--dry-run] [--tag <dist-tag>]');
  const tagIndex = process.argv.indexOf('--tag');
  if (tagIndex >= 0 && !process.argv[tagIndex + 1]) throw new Error('--tag requires a dist-tag');
  const results = await publishRelease(version, {
    dryRun: process.argv.includes('--dry-run'),
    tag: tagIndex >= 0 ? process.argv[tagIndex + 1] : undefined,
  });
  for (const result of results) console.log(`${result.decision}: ${result.name}@${version} (tag: ${result.distTag})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
