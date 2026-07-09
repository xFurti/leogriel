import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubSource, parseGitHubSpecifier } from '../sources/github.js';
import type { HttpClient, HttpRequestOptions } from '../fetch/https.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';

class FakeHttpClient implements HttpClient {
  calls: Array<{ url: string; options?: HttpRequestOptions }> = [];
  constructor(private readonly status = 200, private readonly body: unknown = { sha: SHA }) {}
  async get(url: string, options?: HttpRequestOptions) {
    this.calls.push({ url, options });
    return {
      status: this.status,
      body: Buffer.from(JSON.stringify(this.body)),
      finalUrl: url,
      headers: {},
    };
  }
}

test('parses canonical and legacy GitHub specifiers', () => {
  assert.deepEqual(parseGitHubSpecifier('github:owner/repo@main#skills/foo'), {
    owner: 'owner', repo: 'repo', ref: 'main', subpath: 'skills/foo',
  });
  assert.deepEqual(parseGitHubSpecifier(`github:owner/repo@${SHA}/skills/foo`), {
    owner: 'owner', repo: 'repo', ref: SHA, subpath: 'skills/foo',
  });
  assert.deepEqual(parseGitHubSpecifier('owner/repo#skills/foo'), {
    owner: 'owner', repo: 'repo', ref: undefined, subpath: 'skills/foo',
  });
});

test('resolves mutable refs through the GitHub commit API', async () => {
  const client = new FakeHttpClient();
  const source = new GitHubSource(client);
  const resolved = await source.resolve('github:owner/repo@main#skills/foo');
  assert.equal(resolved.ref, SHA);
  assert.equal(resolved.requestedRef, 'main');
  assert.equal(resolved.resolved, `github:owner/repo@${SHA}#skills/foo`);
  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0].url, /\/commits\/main$/);
});

test('does not call the API for an immutable SHA', async () => {
  const client = new FakeHttpClient();
  const resolved = await new GitHubSource(client).resolve(`github:owner/repo@${SHA}#skills/foo`);
  assert.equal(resolved.ref, SHA);
  assert.equal(client.calls.length, 0);
});

test('fails closed when GitHub cannot resolve a mutable ref', async () => {
  const client = new FakeHttpClient(404, { message: 'Not Found' });
  await assert.rejects(
    new GitHubSource(client).resolve('github:owner/repo@missing'),
    /resolution failed \(404\)/
  );
});
