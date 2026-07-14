import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogManager, SkillsShCatalogProvider } from '../catalog.js';
import { locateSkillDirByName } from '../locate-skill.js';
import type { HttpClient, HttpResponse } from '../fetch/https.js';

class FakeHttpClient implements HttpClient {
  calls = 0;
  constructor(private readonly responses: HttpResponse[]) {}
  async get(): Promise<HttpResponse> {
    return this.responses[Math.min(this.calls++, this.responses.length - 1)];
  }
}

function response(status: number, value: unknown, headers: HttpResponse['headers'] = {}): HttpResponse {
  return { status, body: Buffer.from(JSON.stringify(value)), finalUrl: 'https://skills.sh/api/search', headers };
}

test('skills.sh catalog validates and maps public search results', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'skillctl-catalog-'));
  const client = new FakeHttpClient([response(200, {
    skills: [{ id: 'vercel-labs/skills/find-skills', name: 'find-skills', source: 'vercel-labs/skills', installs: 42 }],
  })]);
  const provider = new SkillsShCatalogProvider(client, { cacheDir });
  const results = await provider.search('find', { limit: 5 });
  assert.equal(results[0].installSpecifier, 'skills.sh/vercel-labs/skills/find-skills');
  assert.equal(results[0].id, 'skills.sh:vercel-labs/skills/find-skills');
  assert.equal(results[0].provider, 'skills.sh');
  assert.deepEqual(results[0].popularity, { metric: 'installs', value: 42 });
  assert.equal(results[0].installs, 42);
  await assert.rejects(() => provider.search('x'), /at least 2/);
  await assert.rejects(() => provider.search('find', { limit: 51 }), /between 1 and 50/);
});

test('catalog manager filters providers and rejects unknown IDs', async () => {
  const provider = { id: 'fixture', search: async () => [{
    id: 'fixture:demo', provider: 'fixture', name: 'demo', source: 'fixture', sourceType: 'fixture',
    installSpecifier: 'fixture:demo', stale: false,
  }] };
  const manager = new CatalogManager([provider]);
  assert.equal((await manager.search('demo', { provider: 'fixture' }))[0].provider, 'fixture');
  await assert.rejects(() => manager.search('demo', { provider: 'missing' }), /Unknown catalog provider/);
  assert.throws(() => manager.register(provider), /already registered/);
});

test('catalog manager always applies the producing provider namespace', async () => {
  const manager = new CatalogManager([{
    id: 'plugin',
    search: async () => [{
      id: 'foreign:demo', provider: 'wrong', name: 'demo', source: 'fixture', sourceType: 'fixture',
      installSpecifier: 'fixture:demo', stale: false,
    }],
  }]);
  const result = await manager.search('demo');
  assert.equal(result[0].id, 'plugin:foreign:demo');
  assert.equal(result[0].provider, 'plugin');
});

test('skills.sh catalog retries and falls back to stale cache', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'skillctl-catalog-cache-'));
  let now = 1_000;
  const first = new SkillsShCatalogProvider(new FakeHttpClient([response(200, {
    skills: [{ id: 'owner/repo/demo', name: 'demo', source: 'owner/repo', installs: 1 }],
  })]), { cacheDir, now: () => now });
  await first.search('demo');
  now += 16 * 60 * 1000;
  const failing = new SkillsShCatalogProvider(new FakeHttpClient([response(503, {}), response(503, {})]), {
    cacheDir,
    now: () => now,
    sleep: async () => {},
  });
  const stale = await failing.search('demo');
  assert.equal(stale[0].stale, true);
});

test('locates a unique skill by frontmatter name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skillctl-selector-'));
  const selected = join(root, 'skills', 'nested-name');
  await mkdir(selected, { recursive: true });
  await writeFile(join(selected, 'SKILL.md'), '---\nname: chosen-skill\ndescription: test\n---\n');
  assert.equal(await locateSkillDirByName(root, 'chosen-skill'), selected);
  await assert.rejects(() => locateSkillDirByName(root, 'missing'), /not found/);
});
