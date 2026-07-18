import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { discoverPluginEntry } from '../loader.js';
import { inspectPluginSpecifier } from '../store.js';

test('plugin entry must remain inside its plugin directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-plugin-'));
  const plugin = join(root, 'plugin');
  await mkdir(plugin);
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ leogriel: { plugin: '../outside.js' } }));
  await assert.rejects(discoverPluginEntry(plugin), /escapes its root/);

  await writeFile(join(plugin, 'package.json'), JSON.stringify({ leogriel: { plugin: './index.js' } }));
  assert.equal(await discoverPluginEntry(plugin), join(plugin, 'index.js'));
});

test('legacy skillctl plugin metadata remains discoverable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-plugin-legacy-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({
    name: 'legacy-plugin',
    skillctl: { plugin: './legacy.js', apiVersion: 1 },
  }));
  await writeFile(join(root, 'legacy.js'), 'export default {};');
  assert.equal(await discoverPluginEntry(root), join(root, 'legacy.js'));
});

test('plugin dry-run inspection reports executable metadata without installing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-plugin-inspect-'));
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: 'fixture-plugin', version: '1.2.3', main: './index.js', dependencies: { semver: '^7.0.0' },
      scripts: { postinstall: 'node setup.js' },
      leogriel: { plugin: './index.js', apiVersion: 1, capabilities: ['commands'] },
    }));
    await writeFile(join(root, 'index.js'), 'export default {};');
    const result = await inspectPluginSpecifier(`file:${root}`, { allowLocal: true });
    assert.equal(result.resolvedVersion, '1.2.3');
    assert.equal(result.trusted, false);
    assert.deepEqual(result.capabilities, ['commands']);
    assert.equal(result.scripts.postinstall, 'node setup.js');
    assert.match(result.warnings.join(' '), /not sandboxed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
