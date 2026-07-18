import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { leogrielUserAgent } from '../fetch/https.js';

test('HTTP user agent follows the registry package version', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  assert.equal(leogrielUserAgent(), `leogriel/${pkg.version}`);
  assert.doesNotMatch(leogrielUserAgent(), /\/0\.5\.0$/);
});
