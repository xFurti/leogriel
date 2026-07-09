import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDefaultManifest, saveManifest } from '@skillctl/manifest';
import { createEmptyLockfile, saveLockfile } from '@skillctl/lockfile';
import { recoverProjectState, updateProjectState, withOperationLocks } from '../index.js';

test('commits manifest and lock as one project state update', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-state-'));
  await saveManifest(createDefaultManifest('before'), cwd);
  await saveLockfile(createEmptyLockfile(), cwd);
  const result = await updateProjectState(cwd, async (state) => {
    state.manifest!.name = 'after';
    state.lockfile!.metadata = { toolVersion: 'test' };
    return { state, result: 42 };
  });
  assert.equal(result, 42);
  assert.match(await readFile(join(cwd, 'agent-skills.json'), 'utf8'), /after/);
  assert.match(await readFile(join(cwd, 'agent-skills.lock'), 'utf8'), /toolVersion: test/);
});

test('rolls back manifest when lock validation fails', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-state-rollback-'));
  await saveManifest(createDefaultManifest('original'), cwd);
  await saveLockfile(createEmptyLockfile(), cwd);
  const manifestBefore = await readFile(join(cwd, 'agent-skills.json'), 'utf8');
  const lockBefore = await readFile(join(cwd, 'agent-skills.lock'), 'utf8');
  await assert.rejects(
    updateProjectState(cwd, async (state) => {
      state.manifest!.name = 'should-rollback';
      (state.lockfile as { lockfileVersion: string }).lockfileVersion = 'invalid';
      return { state, result: undefined };
    })
  );
  assert.equal(await readFile(join(cwd, 'agent-skills.json'), 'utf8'), manifestBefore);
  assert.equal(await readFile(join(cwd, 'agent-skills.lock'), 'utf8'), lockBefore);
});

test('recovers original files from an interrupted transaction journal', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-state-recover-'));
  const originalManifest = '{"name":"original"}\n';
  const originalLock = "lockfileVersion: '1.0'\nskills: {}\n";
  await writeFile(join(cwd, 'agent-skills.json'), 'changed');
  await writeFile(join(cwd, 'agent-skills.lock'), 'changed');
  await writeFile(join(cwd, '.skillctl-transaction.json'), JSON.stringify({
    version: 1,
    phase: 'manifest-written',
    manifest: { exists: true, content: originalManifest },
    lockfile: { exists: true, content: originalLock },
  }));
  assert.equal(await recoverProjectState(cwd), true);
  assert.equal(await readFile(join(cwd, 'agent-skills.json'), 'utf8'), originalManifest);
  assert.equal(await readFile(join(cwd, 'agent-skills.lock'), 'utf8'), originalLock);
});

test('serializes concurrent operations using project then store locks', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-locks-'));
  const store = join(cwd, 'store');
  await mkdir(store);
  const order: string[] = [];
  const first = withOperationLocks({ cwd, store }, async () => {
    order.push('first-start');
    await new Promise((resolve) => setTimeout(resolve, 150));
    order.push('first-end');
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = withOperationLocks({ cwd, store }, async () => {
    order.push('second');
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
});
