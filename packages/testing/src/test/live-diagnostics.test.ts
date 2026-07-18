import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectCodexJsonl, listLiveWorkspaceFiles, redactLiveDiagnostics, type LiveSmokeDiagnostics } from '../index.js';

test('live diagnostics report JSONL event types and the final agent message', () => {
  const output = [
    JSON.stringify({ type: 'thread.started' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'finished safely' } }),
    JSON.stringify({ type: 'turn.completed' }),
  ].join('\n');
  assert.deepEqual(inspectCodexJsonl(output), {
    eventTypes: ['thread.started', 'item.completed', 'turn.completed'],
    finalAgentMessage: 'finished safely',
  });
  assert.deepEqual(inspectCodexJsonl('{invalid'), {
    eventTypes: ['invalid-jsonl'],
    finalAgentMessage: null,
  });
});

test('live diagnostics redact known secrets from messages, stderr, and workspace names', () => {
  const secret = 'live-secret-abcdefghijklmnop';
  const diagnostics: LiveSmokeDiagnostics = {
    exitCode: 1,
    timedOut: false,
    incomplete: true,
    outputTruncated: false,
    requestedModel: 'fixed-model',
    resolvedModel: null,
    eventTypes: ['turn.failed'],
    finalAgentMessage: `failed ${secret}`,
    stderr: secret,
    workspaceFiles: [`${secret}.txt`],
  };
  const redacted = redactLiveDiagnostics(diagnostics, { CODEX_API_KEY: secret });
  assert.doesNotMatch(JSON.stringify(redacted), new RegExp(secret));
  assert.match(JSON.stringify(redacted), /REDACTED/);
});

test('live diagnostics list workspace files without following symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-live-diagnostics-'));
  try {
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'output.txt'), 'ready');
    await writeFile(join(root, 'nested', 'proof.txt'), process.version);
    assert.deepEqual(await listLiveWorkspaceFiles(root), ['nested/', 'nested/proof.txt', 'output.txt']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
