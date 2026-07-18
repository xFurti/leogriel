import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  resolveCanonicalPath,
  formatCanonicalPathForLock,
  needsInstall,
  lockToSkillTargets,
  resolveEntryCanonicalPath,
  computeDirIntegrity,
  matchesDirIntegrity,
  type LockfileEntry,
} from '../index.js';

function makeEntry(overrides: Partial<LockfileEntry> & Pick<LockfileEntry, 'name'>): LockfileEntry {
  return {
    specifier: 'file:./skill',
    resolved: 'file:./skill',
    integrity: 'sha256:placeholder',
    canonicalPath: formatCanonicalPathForLock(overrides.name),
    fetchedAt: new Date().toISOString(),
    provenance: { type: 'local' },
    ...overrides,
  };
}

test('resolveCanonicalPath expands portable tilde store paths', () => {
  const customStore = join(homedir(), 'custom-skill-store');
  const portable = formatCanonicalPathForLock('demo-skill');
  const resolved = resolveCanonicalPath(portable, customStore);
  assert.equal(resolved, join(customStore, 'demo-skill'));
});

test('directory integrity uses portable separators and accepts legacy Windows hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leogriel-portable-integrity-'));
  const content = '---\nname: portable-integrity\n---\n';
  try {
    await mkdir(join(root, 'nested'), { recursive: true });
    await writeFile(join(root, 'nested', 'SKILL.md'), content);

    const expectedHash = createHash('sha256')
      .update('/nested/SKILL.md')
      .update('\0')
      .update('file\0')
      .update(content)
      .update('\0')
      .digest('hex');
    const portable = `sha256:${expectedHash}`;
    assert.equal(await computeDirIntegrity(root), portable);

    const legacyHash = createHash('sha256')
      .update('\\nested\\SKILL.md')
      .update('\0')
      .update('file\0')
      .update(content)
      .update('\0')
      .digest('hex');
    assert.equal(await matchesDirIntegrity(root, `sha256:${legacyHash}`), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resolveCanonicalPath keeps legacy absolute paths', () => {
  const legacy = join(homedir(), '.leogriel', 'skills', 'legacy-skill');
  assert.equal(resolveCanonicalPath(legacy), legacy);
});

test('resolveEntryCanonicalPath falls back to store/name for legacy absolute lock paths', async () => {
  const store = await mkdtemp(join(tmpdir(), 'leogriel-store-'));
  const skillName = 'legacy-fallback';
  const skillDir = join(store, skillName);
  try {
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: legacy-fallback\n---\n');

    const otherMachinePath = join(homedir(), 'other-machine', '.leogriel', 'skills', skillName);
    const entry = makeEntry({
      name: skillName,
      canonicalPath: otherMachinePath,
      integrity: await computeDirIntegrity(skillDir),
    });

    const resolved = await resolveEntryCanonicalPath(entry, { store });
    assert.equal(resolved, skillDir);
    assert.equal(await needsInstall(entry, { store }), false);
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});

test('lockToSkillTargets returns filesystem paths from portable lock entries', async () => {
  const store = await mkdtemp(join(tmpdir(), 'leogriel-store-'));
  const skillName = 'sync-target';
  const skillDir = join(store, skillName);
  try {
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: sync-target\n---\n');
    const integrity = await computeDirIntegrity(skillDir);

    const lock = {
      lockfileVersion: '1.0' as const,
      skills: {
        [skillName]: makeEntry({ name: skillName, integrity }),
      },
    };

    const targets = await lockToSkillTargets(lock, { store });
    assert.equal(targets.length, 1);
    assert.equal(targets[0].canonicalPath, skillDir);
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});
