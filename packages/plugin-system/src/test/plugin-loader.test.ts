import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { discoverPluginEntry } from '../loader.js';

test('plugin entry must remain inside its plugin directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-plugin-'));
  const plugin = join(root, 'plugin');
  await mkdir(plugin);
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ skillctl: { plugin: '../outside.js' } }));
  await assert.rejects(discoverPluginEntry(plugin), /escapes its root/);

  await writeFile(join(plugin, 'package.json'), JSON.stringify({ skillctl: { plugin: './index.js' } }));
  assert.equal(await discoverPluginEntry(plugin), join(plugin, 'index.js'));
});
