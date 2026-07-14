import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { archiveName, releasePackages } from './release-packages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function smokePublishedPackage(version, source = 'registry') {
  if (!version) throw new Error('A package version is required');
  if (!['registry', 'tarballs'].includes(source)) throw new Error(`Unknown smoke source: ${source}`);
  const temporary = await mkdtemp(join(tmpdir(), 'skillctl-npm-smoke-'));
  try {
    const installTargets = source === 'registry'
      ? [`@skillctl/cli@${version}`]
      : releasePackages.map((name) => join(root, 'artifacts', version, archiveName(name, version)));
    runNpm(['install', '--prefix', temporary, '--ignore-scripts=false', ...installTargets]);
    const cli = join(temporary, 'node_modules', '@skillctl', 'cli', 'bin', 'skillctl.js');
    const reported = run(process.execPath, [cli, '--version']).stdout.trim();
    if (version !== 'latest' && reported !== version) throw new Error(`Expected ${version}, received ${reported}`);

    const project = join(temporary, 'project');
    const skill = join(project, 'smoke-skill');
    await mkdir(skill, { recursive: true });
    await writeFile(join(skill, 'SKILL.md'), '---\nname: smoke-skill\ndescription: registry smoke\n---\nSmoke instructions.\n');
    const env = { ...process.env, SKILLCTL_CONFIG: join(temporary, 'config.json'), SKILLCTL_STORE: join(temporary, 'store') };
    run(process.execPath, [cli, 'init', '--no-prompt', '--json'], { cwd: project, env });
    validateEnvelope(run(process.execPath, [cli, 'list', '--json'], { cwd: project, env }).stdout, 'list');
    validateEnvelope(runAllowingOne(process.execPath, [cli, 'doctor', '--json'], { cwd: project, env }).stdout, 'doctor');
    validateEnvelope(run(process.execPath, [cli, 'skill', 'validate', skill, '--json'], { cwd: project, env }).stdout, 'skill validate');

    const installed = JSON.parse(await readFile(join(temporary, 'node_modules', '@skillctl', 'cli', 'package.json'), 'utf8'));
    return { source, requestedVersion: version, installedVersion: installed.version };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function validateEnvelope(stdout, command) {
  const value = JSON.parse(stdout);
  if (value.schemaVersion !== 1 || value.command !== command || !Array.isArray(value.warnings) || !Array.isArray(value.errors)) {
    throw new Error(`Invalid JSON envelope for ${command}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result;
}

function runAllowingOne(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });
  if (result.status !== 0 && result.status !== 1) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`);
  return result;
}

function runNpm(args) {
  if (process.platform !== 'win32') return run('npm', args);
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return run(process.execPath, [npmCli, ...args]);
}

async function main() {
  const version = process.argv[2];
  const sourceIndex = process.argv.indexOf('--source');
  const source = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : 'registry';
  const result = await smokePublishedPackage(version, source);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
