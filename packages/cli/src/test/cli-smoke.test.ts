import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', '..', 'bin', 'skillctl.js');

test('CLI awaits async parsing and reports its version', async () => {
  const { stdout } = await execFileAsync(process.execPath, [cli, '--version']);
  assert.match(stdout, /^0\.4\.0\s*$/);
});

test('frozen install rejects a manifest dependency missing from the lockfile', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'skillctl-frozen-'));
  await writeFile(
    join(cwd, 'agent-skills.json'),
    JSON.stringify({ agentSkills: { dependencies: { demo: 'github:owner/demo' } } })
  );

  await assert.rejects(
    execFileAsync(process.execPath, [cli, 'install', '--frozen', '--no-sync'], { cwd }),
    (err: NodeJS.ErrnoException & { code?: number; stderr?: string }) =>
      err.code === 2 && Boolean(err.stderr?.includes('missing from lockfile'))
  );
});
