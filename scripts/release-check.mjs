import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowDirty = process.argv.includes('--allow-dirty');
const windowsGit = 'C:\\Program Files\\Git\\cmd\\git.exe';
const git = process.platform === 'win32' && existsSync(windowsGit) ? windowsGit : 'git';
const corepack = process.platform === 'win32'
  ? join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js')
  : null;

function runPnpm(args) {
  if (corepack) return run(process.execPath, [corepack, 'pnpm', ...args]);
  return run('corepack', ['pnpm', ...args]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  return result;
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout.trim();
}

if (!allowDirty && capture(git, ['status', '--porcelain'])) {
  throw new Error('Working tree is dirty. Commit changes or use --allow-dirty while preparing the release.');
}

const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = rootPackage.version;
const packageDirectories = (await readdir(join(root, 'packages'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const directory of packageDirectories) {
  const packageJson = JSON.parse(await readFile(join(root, 'packages', directory, 'package.json'), 'utf8'));
  if (packageJson.version !== version) throw new Error(`${packageJson.name} version does not match ${version}`);
}

const manifest = JSON.parse(await readFile(join(root, 'agent-skills.json'), 'utf8'));
if (manifest.version !== version) throw new Error(`agent-skills.json version does not match ${version}`);
const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${version}] - `)) throw new Error(`CHANGELOG.md has no dated ${version} section`);

runPnpm(['install', '--frozen-lockfile']);
runPnpm(['-r', 'build']);
runPnpm(['-r', 'lint']);
runPnpm(['-r', 'test']);
runPnpm(['test:coverage']);
runPnpm(['audit', '--prod']);
run(process.execPath, ['packages/cli/bin/skillctl.js', 'skill', 'validate', 'skills/skillctl', '--strict']);
run(process.execPath, ['packages/cli/bin/skillctl.js', 'doctor', '--json']);
run(process.execPath, ['packages/cli/bin/skillctl.js', 'audit', '--strict']);
run(process.execPath, ['scripts/pack-all.mjs']);
run(git, ['diff', '--check']);

console.log(`Release checks passed for ${version}.`);
