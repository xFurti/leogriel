import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateSkillDir } from '../validate-skill.js';

test('validateSkillDir passes for valid skill directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'validate-skill-'));
  const skillDir = join(root, 'demo-skill');
  try {
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: demo-skill\n---\n# Demo\n');
    const report = await validateSkillDir(skillDir);
    assert.equal(report.status, 'ok');
    assert.equal(report.scanned, 1);
    assert.equal(report.findings.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validateSkillDir errors when SKILL.md is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'validate-skill-'));
  const skillDir = join(root, 'empty-skill');
  try {
    await mkdir(skillDir, { recursive: true });
    const report = await validateSkillDir(skillDir);
    assert.equal(report.status, 'errors');
    assert.ok(report.findings.some((f) => f.rule === 'skill-md-missing'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});