import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeDirIntegrity } from '@leogriel/core';
import { getBackup, listBackups, removeBackup, restoreBackup } from '../index.js';

test('backup IDs remain logical while directories are Windows-safe', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-backup-'));
  const filesystemId = '2026-07-14T10-20-30-000Z';
  const directory = join(cwd, '.leogriel', 'backups', 'sync', filesystemId, 'codex', 'demo');
  const content = join(directory, 'content');
  const original = join(cwd, '.codex', 'skills', 'demo');
  const nested = join(cwd, 'nested', 'directory');
  const id = `project:${filesystemId}:codex:demo`;
  try {
    await writeFile(join(cwd, 'agent-skills.json'), '{"version":"0.9.0","skills":{}}');
    await mkdir(nested, { recursive: true });
    await mkdir(content, { recursive: true });
    await writeFile(join(content, 'SKILL.md'), 'backup');
    await writeFile(join(directory, 'metadata.json'), JSON.stringify({
      version: 1, id, filesystemId, scope: 'project', adapter: 'codex', skill: 'demo',
      originalPath: original, integrity: await computeDirIntegrity(content), timestamp: '2026-07-14T10:20:30.000Z', command: 'leogriel sync',
    }));
    assert.equal((await listBackups({ cwd: nested }))[0].id, id);
    assert.equal((await getBackup(id, { cwd: nested }))?.filesystemId, filesystemId);
    assert.equal((await restoreBackup(id, { cwd: nested, dryRun: true })).restored, false);
    await restoreBackup(id, { cwd: nested });
    assert.equal(await readFile(join(original, 'SKILL.md'), 'utf8'), 'backup');
    assert.equal((await removeBackup(id, { cwd, dryRun: true })).removed, false);
    assert.equal((await removeBackup(id, { cwd })).removed, true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('corrupted backup metadata cannot target an arbitrary path', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'leogriel-backup-corrupt-'));
  const filesystemId = 'safe-id';
  const directory = join(cwd, '.leogriel', 'backups', 'sync', filesystemId, 'codex', 'demo');
  const outside = join(cwd, 'outside', 'valuable');
  const id = `project:${filesystemId}:codex:demo`;
  try {
    await writeFile(join(cwd, 'agent-skills.json'), '{"version":"0.9.0","skills":{}}');
    await mkdir(join(directory, 'content'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'keep.txt'), 'keep');
    await writeFile(join(directory, 'content', 'SKILL.md'), 'malicious');
    await writeFile(join(directory, 'metadata.json'), JSON.stringify({
      version: 1, id, filesystemId, scope: 'project', adapter: 'codex', skill: 'demo',
      originalPath: outside, integrity: await computeDirIntegrity(join(directory, 'content')),
      timestamp: new Date().toISOString(), command: 'tampered',
    }));
    assert.deepEqual(await listBackups({ cwd }), []);
    await assert.rejects(restoreBackup(id, { cwd }), /Backup not found/);
    assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep');

    for (const mutation of [
      { scope: 'global' }, { adapter: 'unknown' }, { skill: '../escape' }, { filesystemId: 'wrong:id' },
    ]) {
      const base = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
      await writeFile(join(directory, 'metadata.json'), JSON.stringify({ ...base, originalPath: join(cwd, '.codex', 'skills', 'demo'), ...mutation }));
      assert.deepEqual(await listBackups({ cwd }), []);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
