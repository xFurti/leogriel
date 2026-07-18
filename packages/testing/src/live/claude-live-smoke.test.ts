import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ClaudeRunner, createIsolation, destroyIsolation, inspectCodexJsonl, listLiveWorkspaceFiles,
  redactLiveDiagnostics, type AgentRunResult, type LiveSmokeDiagnostics,
} from '../index.js';

const enabled = process.env.LEOGRIEL_LIVE_CLAUDE === '1';

test('live Claude creates exact files through sandboxed Node with network denied', { skip: !enabled }, async () => {
  const model = process.env.LEOGRIEL_LIVE_CLAUDE_MODEL || process.env.LEOGRIEL_LIVE_MODEL;
  assert.ok(model, 'LEOGRIEL_LIVE_CLAUDE_MODEL must contain one exact Claude model ID');
  const isolation = await createIsolation();
  let result: AgentRunResult | undefined;
  try {
    assert.deepEqual(await readdir(isolation.workspace), []);
    const runner = new ClaudeRunner();
    const detection = await runner.detect();
    assert.equal(detection.available, true, detection.reason);
    result = await runner.run({
      prompt: [
        'Use the Bash terminal tool. Do not only explain the solution.',
        'Run Node to:',
        '1. create output.txt containing exactly `leogriel-live-smoke`;',
        '2. create node-proof.txt containing exactly the value of process.version;',
        '3. read both files and verify their contents before finishing.',
        'The files must be created in the current workspace. Do not infer or manually type the Node.js version.',
      ].join('\n'),
      workspace: isolation.workspace,
      isolationRoot: isolation.root,
      timeoutMs: 120_000,
      network: { mode: 'deny', webSearch: 'disabled' },
      requestedModel: model,
      auth: runner.resolveAuth(),
    });
    const output = await readOptional(join(isolation.workspace, 'output.txt'));
    const nodeProof = await readOptional(join(isolation.workspace, 'node-proof.txt'));
    if (!result.ok || !output.exists || output.value !== 'leogriel-live-smoke' || !nodeProof.exists || nodeProof.value !== process.version) {
      await printDiagnostics(result, isolation.workspace);
    }
    assert.equal(result.ok, true, result.error);
    assert.equal(result.requestedModel, model);
    assert.equal(output.value, 'leogriel-live-smoke');
    assert.equal(nodeProof.value, process.version);
  } finally {
    await destroyIsolation(isolation);
    await assert.rejects(access(isolation.root));
  }
});

async function readOptional(path: string): Promise<{ exists: boolean; value?: string }> {
  try { return { exists: true, value: await readFile(path, 'utf8') }; }
  catch { return { exists: false }; }
}

async function printDiagnostics(result: AgentRunResult | undefined, workspace: string): Promise<void> {
  const inspected = inspectCodexJsonl(result?.output || '');
  const diagnostics: LiveSmokeDiagnostics = {
    exitCode: result?.exitCode ?? null,
    timedOut: result?.timedOut === true,
    incomplete: result?.incomplete === true,
    outputTruncated: result?.outputTruncated === true,
    requestedModel: result?.requestedModel ?? null,
    resolvedModel: result?.resolvedModel ?? null,
    eventTypes: inspected.eventTypes,
    finalAgentMessage: inspected.finalAgentMessage,
    stderr: result?.stderr || '',
    workspaceFiles: await listLiveWorkspaceFiles(workspace),
  };
  process.stderr.write(`Live Claude smoke diagnostics:\n${JSON.stringify(redactLiveDiagnostics(diagnostics), null, 2)}\n`);
}
