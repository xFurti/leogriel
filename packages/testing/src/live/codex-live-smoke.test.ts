import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CodexRunner,
  createIsolation,
  destroyIsolation,
  inspectCodexJsonl,
  listLiveWorkspaceFiles,
  redactLiveDiagnostics,
  resolveCodexAuth,
  type AgentRunResult,
  type LiveSmokeDiagnostics,
} from '../index.js';

const enabled = process.env.LEOGRIEL_LIVE_CODEX === '1';
const debug = process.env.LEOGRIEL_LIVE_DEBUG === '1';
const keepFailedWorkspace = process.env.LEOGRIEL_LIVE_KEEP_WORKSPACE === '1';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

test('live Codex creates the requested file with network disabled', { skip: !enabled }, async () => {
  const model = process.env.LEOGRIEL_LIVE_MODEL;
  assert.ok(model, 'LEOGRIEL_LIVE_MODEL must contain one exact Codex model ID');
  const isolation = await createIsolation();
  let result: AgentRunResult | undefined;
  let failed = false;
  let diagnosticsPrinted = false;
  try {
    assert.deepEqual(await readdir(isolation.workspace), []);
    const runner = new CodexRunner();
    result = await runner.run({
      prompt: [
        'Use the terminal tool. Do not only explain the solution.',
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
      auth: resolveCodexAuth(),
    });
    const output = await readOptional(join(isolation.workspace, 'output.txt'));
    const nodeProof = await readOptional(join(isolation.workspace, 'node-proof.txt'));
    const failures = [
      result.ok ? undefined : result.error || 'Codex runner did not complete successfully',
      result.requestedModel === model ? undefined : 'The requested model was not preserved',
      output.exists ? undefined : 'output.txt was not created',
      output.value === 'leogriel-live-smoke' ? undefined : 'output.txt content is not exact',
      nodeProof.exists ? undefined : 'node-proof.txt was not created',
      nodeProof.value === process.version ? undefined : `node-proof.txt does not equal process.version (${process.version})`,
    ].filter((item): item is string => Boolean(item));
    failed = failures.length > 0;
    if (failed || debug) {
      await printDiagnostics(result, isolation.workspace);
      diagnosticsPrinted = true;
    }
    assert.equal(result.ok, true, result.error);
    assert.equal(result.requestedModel, model);
    assert.equal(output.exists, true, 'output.txt must exist');
    assert.equal(output.value, 'leogriel-live-smoke', 'output.txt must contain the exact expected value');
    assert.equal(nodeProof.exists, true, 'node-proof.txt must exist');
    assert.equal(nodeProof.value, process.version, 'node-proof.txt must contain the exact process.version value');
  } catch (error) {
    failed = true;
    if (!diagnosticsPrinted) await printDiagnostics(result, isolation.workspace);
    throw error;
  } finally {
    if (failed && keepFailedWorkspace) {
      try {
        const kept = await preserveFailedWorkspace(isolation.workspace);
        process.stderr.write(`Retained failed live-smoke workspace: ${kept}\n`);
      } catch (error) {
        process.stderr.write(`Unable to retain failed live-smoke workspace: ${(error as Error).message}\n`);
      }
    }
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
  process.stderr.write(`Live smoke diagnostics:\n${JSON.stringify(redactLiveDiagnostics(diagnostics), null, 2)}\n`);
}

async function preserveFailedWorkspace(workspace: string): Promise<string> {
  const destination = join(
    repositoryRoot,
    '.leogriel',
    'artifacts',
    'test',
    'live',
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`,
    'workspace',
  );
  await mkdir(dirname(destination), { recursive: true });
  await cp(workspace, destination, { recursive: true, force: false, errorOnExist: true });
  return destination;
}
