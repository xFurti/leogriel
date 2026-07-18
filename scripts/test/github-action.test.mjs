import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { badgeDocument, main as renderReport, normalizeTestResult, renderHtml, renderMarkdown } from '../render-test-report.mjs';
import { upsertReportComment } from '../comment-test-report.mjs';

const sampleEnvelope = {
  schemaVersion: 1,
  ok: true,
  command: 'test',
  data: {
    schemaVersion: 1,
    skill: 'demo',
    runner: 'codex',
    runs: 3,
    requestedModel: 'fixed-model',
    resolvedModels: ['fixed-model'],
    verdict: 'improved',
    baselinePassRate: 0,
    skillPassRate: 1,
    comparison: {
      requestedRef: 'main',
      commit: 'a'.repeat(40),
      referenceIntegrity: 'sha256:reference',
      candidateIntegrity: 'sha256:candidate',
    },
    cases: [{ name: 'writes <output>|', verdict: 'improved', baselinePassRate: 0, skillPassRate: 1 }],
  },
  warnings: [],
  errors: [],
};

test('renders deterministic Markdown, HTML, and badge reports', () => {
  const result = normalizeTestResult(sampleEnvelope);
  const markdown = renderMarkdown(result);
  const html = renderHtml(result, markdown);
  assert.match(markdown, /leogriel-regression-report/);
  assert.match(markdown, /✅ improved/);
  assert.match(markdown, /main/);
  assert.doesNotMatch(markdown, /writes <output>/);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /writes &lt;output&gt;\|/);
  assert.deepEqual(badgeDocument('regressed'), { schemaVersion: 1, label: 'Leogriel', message: 'regressed', color: 'red' });
});

test('writes reports, Job Summary, and action output without overwriting files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-action-report-'));
  const input = join(root, 'result.json');
  const markdown = join(root, 'report.md');
  const html = join(root, 'report.html');
  const badge = join(root, 'badge.json');
  const summary = join(root, 'summary.md');
  const output = join(root, 'github-output.txt');
  try {
    await writeFile(input, JSON.stringify(sampleEnvelope));
    const result = await renderReport(
      [input, '--markdown', markdown, '--html', html, '--badge', badge, '--summary'],
      { GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output },
    );
    assert.equal(result.verdict, 'improved');
    assert.match(await readFile(markdown, 'utf8'), /Test cases/);
    assert.match(await readFile(html, 'utf8'), /fixed-model/);
    assert.equal(JSON.parse(await readFile(badge, 'utf8')).message, 'improved');
    assert.match(await readFile(summary, 'utf8'), /Leogriel behavioral regression/);
    assert.equal(await readFile(output, 'utf8'), 'verdict=improved\n');
    await assert.rejects(renderReport([input, '--markdown', markdown, '--html', join(root, 'other.html'), '--badge', join(root, 'other.json')], {}), /exist/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('creates and updates only marked pull-request comments', async () => {
  const calls = [];
  const request = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method) return response([]);
    return response({ id: 7 });
  };
  const body = renderMarkdown(normalizeTestResult(sampleEnvelope));
  const created = await upsertReportComment({ token: 'test-token', repository: 'owner/repo', pullRequest: 12, body, request });
  assert.equal(created.action, 'created');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers.authorization, 'Bearer test-token');

  calls.length = 0;
  const updateRequest = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method) return response([{ id: 9, body }]);
    return response({ id: 9 });
  };
  const updated = await upsertReportComment({ token: 'test-token', repository: 'owner/repo', pullRequest: 12, body, request: updateRequest });
  assert.equal(updated.action, 'updated');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.match(calls[1].url, /issues\/comments\/9$/);
  await assert.rejects(upsertReportComment({ token: '', repository: 'owner/repo', pullRequest: 12, body, request }), /github-token/);
  await assert.rejects(upsertReportComment({ token: 'x', repository: 'owner/repo', pullRequest: 12, body: 'unmarked', request }), /unmarked/);
});

test('official composite action preserves reports before enforcing the CLI exit code', async () => {
  const source = await readFile(new URL('../../action.yml', import.meta.url), 'utf8');
  assert.match(source, /actions\/setup-node@v6/);
  assert.match(source, /@openai\/codex/);
  assert.match(source, /@anthropic-ai\/claude-code/);
  assert.match(source, /ANTHROPIC_API_KEY: ''/);
  assert.match(source, /ANTHROPIC_AUTH_TOKEN: ''/);
  assert.match(source, /actions\/upload-artifact@v7/);
  assert.match(source, /render-test-report\.mjs/);
  assert.match(source, /comment-test-report\.mjs/);
  assert.ok(source.indexOf('Upload regression reports') < source.indexOf('Enforce regression verdict'));
  assert.doesNotMatch(source, /CODEX_API_KEY:\s*\$\{\{/);
});

test('live-runner validation remains local and does not require hosted secrets', async () => {
  await assert.rejects(
    readFile(new URL('../../.github/workflows/runner-live.yml', import.meta.url), 'utf8'),
    (error) => error?.code === 'ENOENT',
  );
  const matrix = await readFile(new URL('../../docs/validation-matrix.md', import.meta.url), 'utf8');
  assert.match(matrix, /Live runner validation is local and opt-in/);
  assert.match(matrix, /hosted workflow URL is not required/);
  assert.doesNotMatch(matrix, /LEOGRIEL_LIVE_(?:CODEX|CLAUDE)_API_KEY/);
});

function response(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}
