import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic, type SkillLockfile } from '@leogriel/core';
import { loadManifest, saveManifest, type AgentSkillsManifest } from '@leogriel/manifest';
import { loadLockfile, saveLockfile } from '@leogriel/lockfile';

const JOURNAL_NAME = '.leogriel-transaction.json';
const LEGACY_JOURNAL_NAME = '.skillctl-transaction.json';

export interface ProjectState {
  manifest: AgentSkillsManifest | null;
  lockfile: SkillLockfile | null;
}

interface Snapshot {
  exists: boolean;
  content?: string;
}

interface TransactionJournal {
  version: 1;
  phase: 'prepared' | 'manifest-written';
  manifest: Snapshot;
  lockfile: Snapshot;
}

export async function readProjectState(cwd: string): Promise<ProjectState> {
  await recoverProjectState(cwd);
  const [manifest, lockfile] = await Promise.all([loadManifest(cwd), loadLockfile(cwd)]);
  return { manifest, lockfile };
}

export async function updateProjectState<T>(
  cwd: string,
  mutator: (state: ProjectState) => Promise<{ state: ProjectState; result: T }> | { state: ProjectState; result: T }
): Promise<T> {
  await recoverProjectState(cwd);
  const current: ProjectState = {
    manifest: await loadManifest(cwd),
    lockfile: await loadLockfile(cwd),
  };
  const next = await mutator(current);
  const manifestPath = join(cwd, 'agent-skills.json');
  const lockPath = join(cwd, 'agent-skills.lock');
  const journalPath = join(cwd, JOURNAL_NAME);
  const journal: TransactionJournal = {
    version: 1,
    phase: 'prepared',
    manifest: await snapshot(manifestPath),
    lockfile: await snapshot(lockPath),
  };
  await writeJournal(journalPath, journal);

  try {
    if (next.state.manifest) await saveManifest(next.state.manifest, cwd);
    else await rm(manifestPath, { force: true });
    journal.phase = 'manifest-written';
    await writeJournal(journalPath, journal);
    if (next.state.lockfile) await saveLockfile(next.state.lockfile, cwd);
    else await rm(lockPath, { force: true });
    await rm(journalPath, { force: true });
    return next.result;
  } catch (err) {
    try {
      await restore(manifestPath, journal.manifest);
      await restore(lockPath, journal.lockfile);
      await rm(journalPath, { force: true });
    } catch (rollbackError) {
      throw new Error('Project state update and rollback both failed', {
        cause: { updateError: err, rollbackError },
      });
    }
    throw err;
  }
}

export async function recoverProjectState(cwd: string): Promise<boolean> {
  let journalPath = join(cwd, JOURNAL_NAME);
  let journal: TransactionJournal;
  try {
    journal = JSON.parse(await readFile(journalPath, 'utf8')) as TransactionJournal;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      journalPath = join(cwd, LEGACY_JOURNAL_NAME);
      try {
        journal = JSON.parse(await readFile(journalPath, 'utf8')) as TransactionJournal;
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw new Error(`Invalid project transaction journal: ${journalPath}`, { cause: legacyError });
      }
    } else {
      throw new Error(`Invalid project transaction journal: ${journalPath}`, { cause: err });
    }
  }
  if (journal.version !== 1) throw new Error(`Unsupported project transaction journal: ${journal.version}`);
  await restore(join(cwd, 'agent-skills.json'), journal.manifest);
  await restore(join(cwd, 'agent-skills.lock'), journal.lockfile);
  await rm(journalPath, { force: true });
  return true;
}

async function snapshot(path: string): Promise<Snapshot> {
  try {
    return { exists: true, content: await readFile(path, 'utf8') };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false };
    throw err;
  }
}

async function restore(path: string, value: Snapshot): Promise<void> {
  if (value.exists) await writeFileAtomic(path, value.content || '');
  else await rm(path, { force: true });
}

async function writeJournal(path: string, journal: TransactionJournal): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(journal, null, 2)}\n`);
}
