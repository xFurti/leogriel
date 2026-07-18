import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { archiveName, releasePackages } from './release-packages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function npmInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  if (platform === 'win32') {
    return {
      command: execPath,
      args: [join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args],
    };
  }
  return { command: 'npm', args };
}

export function tarballIntegrity(buffer) {
  return `sha512-${createHash('sha512').update(buffer).digest('base64')}`;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

export function canonicalPackageJson(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return `${JSON.stringify(sortJson(parsed))}\n`;
}

export function canonicalArchiveEntry(portablePath, buffer) {
  if (portablePath === 'dist/.tsbuildinfo') return null;
  if (portablePath === 'package.json') return Buffer.from(canonicalPackageJson(buffer.toString('utf8')));
  if (
    portablePath === 'README.md'
    || portablePath === 'LICENSE'
    || portablePath === 'dist/commands/completion.js'
  ) {
    return Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n'));
  }
  return buffer;
}

export function publicationDecision(localIntegrity, remoteIntegrity, contentEquivalent = false) {
  if (!remoteIntegrity) return 'publish';
  if (remoteIntegrity === localIntegrity) return 'skip';
  if (contentEquivalent) return 'skip-equivalent';
  return 'conflict';
}

export function resolveDistTag(version, override) {
  const tag = override?.trim() || (version.includes('-') ? 'next' : 'latest');
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(tag)) throw new Error(`Invalid npm dist-tag: ${tag}`);
  if (/^v?\d+(?:\.\d+){1,2}(?:[-+].*)?$/i.test(tag)) throw new Error(`npm dist-tag cannot be a version: ${tag}`);
  return tag;
}

function npm(args, options = {}) {
  const invocation = npmInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
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

function assertSafeArchiveListing(listing, archive) {
  for (const entry of listing.split(/\r?\n/).filter(Boolean)) {
    const normalized = entry.replaceAll('\\', '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').includes('..')) {
      throw new Error(`Unsafe tar entry in ${archive}: ${entry}`);
    }
  }
}

async function collectArchiveFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed in release archive: ${path}`);
    if (entry.isDirectory()) files.push(...await collectArchiveFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function archiveContentDigest(archive) {
  const staging = await mkdtemp(join(tmpdir(), 'leogriel-release-compare-'));
  try {
    const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    if (listing.status !== 0) throw new Error(listing.stderr || `Unable to list ${archive}`);
    assertSafeArchiveListing(listing.stdout, archive);
    const extracted = spawnSync('tar', ['-xzf', archive, '-C', staging], { encoding: 'utf8' });
    if (extracted.status !== 0) throw new Error(extracted.stderr || `Unable to extract ${archive}`);
    const packageRoot = join(staging, 'package');
    const files = await collectArchiveFiles(packageRoot);
    const hash = createHash('sha256');
    for (const path of files.sort((left, right) => left.localeCompare(right))) {
      const portablePath = relative(packageRoot, path).replaceAll('\\', '/');
      const buffer = await readFile(path);
      const canonical = canonicalArchiveEntry(portablePath, buffer);
      if (canonical === null) continue;
      hash.update(portablePath).update('\0');
      hash.update(canonical);
      hash.update('\0');
    }
    return `sha256-${hash.digest('hex')}`;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function remoteArchiveEquivalent(name, version, localArchive, expectedRemoteIntegrity) {
  const result = npm(['view', `${name}@${version}`, 'dist.tarball', '--json']);
  if (result.status !== 0) throw new Error(result.stderr || `npm view tarball failed for ${name}@${version}`);
  const url = JSON.parse(result.stdout || 'null');
  if (typeof url !== 'string' || !url.startsWith('https://registry.npmjs.org/')) {
    throw new Error(`Unexpected npm tarball URL for ${name}@${version}`);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download ${name}@${version}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (tarballIntegrity(buffer) !== expectedRemoteIntegrity) {
    throw new Error(`Downloaded integrity mismatch for ${name}@${version}`);
  }
  const staging = await mkdtemp(join(tmpdir(), 'leogriel-registry-archive-'));
  const remoteArchive = join(staging, 'package.tgz');
  try {
    await writeFile(remoteArchive, buffer);
    const [localDigest, remoteDigest] = await Promise.all([
      archiveContentDigest(localArchive),
      archiveContentDigest(remoteArchive),
    ]);
    return localDigest === remoteDigest;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function waitForRemoteIntegrity(name, version, archive, expected, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remote = remoteIntegrity(name, version);
    if (remote === expected) return remote;
    if (remote && remote !== expected) {
      if (await remoteArchiveEquivalent(name, version, archive, remote)) return remote;
      throw new Error(`Post-publish integrity conflict for ${name}@${version}`);
    }
    if (attempt + 1 < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error(`Post-publish verification timed out for ${name}@${version}`);
}

export async function publishRelease(version, options = {}) {
  const dryRun = options.dryRun === true;
  const distTag = resolveDistTag(version, options.tag);
  const results = [];
  for (const shortName of releasePackages) {
    const name = `@leogriel/${shortName}`;
    const archive = join(root, 'artifacts', version, archiveName(shortName, version));
    const integrity = tarballIntegrity(await readFile(archive));
    const remote = remoteIntegrity(name, version);
    let decision = publicationDecision(integrity, remote);
    if (decision === 'conflict' && await remoteArchiveEquivalent(name, version, archive, remote)) {
      decision = publicationDecision(integrity, remote, true);
    }
    if (decision === 'conflict') {
      throw new Error(`${name}@${version} exists with different integrity`);
    }
    if (decision === 'publish' && !dryRun) {
      const result = npm(['publish', archive, '--access', 'public', '--tag', distTag], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`npm publish failed for ${name}@${version}`);
    }
    results.push({ name, version, archive, integrity, decision, distTag });
  }
  if (!dryRun) {
    for (const result of results) {
      result.registryIntegrity = await waitForRemoteIntegrity(result.name, version, result.archive, result.integrity);
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
