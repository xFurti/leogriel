import test from 'node:test';
import assert from 'node:assert/strict';
import { extractReleaseNotes } from '../extract-release-notes.mjs';
import { publicationDecision, resolveDistTag, tarballIntegrity } from '../publish-release.mjs';

test('extracts one changelog release section', () => {
  const changelog = '# Changelog\n\n## [0.7.0] - 2026-07-14\n\n### Added\n\n- Search.\n\n## [0.6.1] - 2026-07-13\n\n- Fix.';
  assert.equal(extractReleaseNotes(changelog, '0.7.0'), '### Added\n\n- Search.');
});

test('publication decisions are idempotent and reject conflicts', () => {
  assert.equal(publicationDecision('sha512-a', null), 'publish');
  assert.equal(publicationDecision('sha512-a', 'sha512-a'), 'skip');
  assert.equal(publicationDecision('sha512-a', 'sha512-b'), 'conflict');
  assert.match(tarballIntegrity(Buffer.from('archive')), /^sha512-/);
  assert.equal(resolveDistTag('1.2.3'), 'latest');
  assert.equal(resolveDistTag('1.2.3-beta.1'), 'next');
  assert.equal(resolveDistTag('1.2.3-beta.1', 'beta'), 'beta');
  assert.throws(() => resolveDistTag('1.2.3', '1.2.3'), /cannot be a version/);
});
