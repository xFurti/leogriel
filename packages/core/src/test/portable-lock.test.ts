import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPortableSpecifier,
  isPortableCanonicalPath,
  findPortablePathWarnings,
  formatCanonicalPathForLock,
} from '../index.js';

test('isPortableSpecifier accepts remote and project-relative forms', () => {
  assert.equal(isPortableSpecifier('github:foo/bar'), true);
  assert.equal(isPortableSpecifier('file:./skills/foo'), true);
  assert.equal(isPortableSpecifier('local:imported/my-skill'), true);
  assert.equal(isPortableSpecifier('file:/Users/me/skill'), false);
  assert.equal(isPortableSpecifier('local:/Users/me/skill'), false);
});

test('isPortableCanonicalPath accepts tilde store paths only', () => {
  assert.equal(isPortableCanonicalPath(formatCanonicalPathForLock('demo')), true);
  assert.equal(isPortableCanonicalPath('/Users/me/.skillctl/skills/demo'), false);
});

test('findPortablePathWarnings flags legacy lock entries', () => {
  const warnings = findPortablePathWarnings({
    lockfileVersion: '1.0',
    skills: {
      demo: {
        specifier: 'file:/Users/me/project/skill',
        resolved: 'local:/Users/me/project/skill',
        integrity: 'sha256:abc',
        name: 'demo',
        canonicalPath: '/Users/me/.skillctl/skills/demo',
        fetchedAt: '2026-01-01T00:00:00.000Z',
        provenance: { type: 'local' },
      },
    },
  });
  assert.equal(warnings.length, 3);
});