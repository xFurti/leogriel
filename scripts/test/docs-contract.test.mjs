import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('current documentation follows the coordinated workspace version', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const current = pkg.version;
  const currentFiles = [
    'README.md',
    'CONTRIBUTING.md',
    'leogriel-design.md',
    'packages/cli/README.md',
    'docs/index.html',
    'docs/assets/translations.js',
    'docs/public-contracts.md',
    'docs/behavioral-testing.md',
    'skills/leogriel/references/troubleshooting.md',
    'skills/leogriel/references/workflows.md',
  ];
  for (const file of currentFiles) {
    const source = await readFile(join(root, file), 'utf8');
    assert.match(source, new RegExp(escapeRegExp(current)), `${file} does not reference ${current}`);
    const prereleases = source.match(/1\.0\.0-beta\.\d+/g) || [];
    assert.deepEqual([...new Set(prereleases)], [current], `${file} contains a stale prerelease`);
  }
});

test('public package lists include every workspace package', async () => {
  const packageNames = [];
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkg = JSON.parse(await readFile(join(root, 'packages', entry.name, 'package.json'), 'utf8'));
    packageNames.push(pkg.name.replace('@leogriel/', ''));
  }
  const sources = await Promise.all([
    readFile(join(root, 'leogriel-design.md'), 'utf8'),
    readFile(join(root, 'CONTRIBUTING.md'), 'utf8'),
    readFile(join(root, 'docs', 'assets', 'translations.js'), 'utf8'),
  ]);
  for (const name of packageNames) {
    for (const source of sources) assert.match(source, new RegExp(`(?:>|\\b)${escapeRegExp(name)}(?:<|\\b)`), name);
  }
});

test('canonical and distributable meta-skills remain identical', async () => {
  const canonical = join(root, '.leogriel', 'skills', 'leogriel');
  const distributable = join(root, 'skills', 'leogriel');
  const [left, right] = await Promise.all([snapshot(canonical), snapshot(distributable)]);
  assert.deepEqual(left, right);
});

test('repository security and contribution entry points exist', async () => {
  const security = await readFile(join(root, 'SECURITY.md'), 'utf8');
  assert.match(security, /Reporting a vulnerability/);
  assert.match(security, /Plugins execute Node\.js/);
  await Promise.all([
    readFile(join(root, '.github', 'ISSUE_TEMPLATE', 'bug.yml'), 'utf8'),
    readFile(join(root, '.github', 'ISSUE_TEMPLATE', 'feature.yml'), 'utf8'),
    readFile(join(root, '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8'),
  ]);
});

async function snapshot(path) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) await visit(child);
      else files.push([relative(path, child).replaceAll('\\', '/'), await readFile(child, 'utf8')]);
    }
  };
  await visit(path);
  return files.sort(([left], [right]) => left.localeCompare(right));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
