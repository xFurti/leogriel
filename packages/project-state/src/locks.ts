import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';

export class OperationLockError extends Error {
  readonly code = 'E_LOCK_TIMEOUT';
  constructor(path: string, cause?: unknown) {
    super(`Timed out waiting for leogriel operation lock: ${path}`, { cause });
    this.name = 'OperationLockError';
  }
}

export interface OperationLockOptions {
  cwd: string;
  store: string;
  timeoutMs?: number;
}

export async function withOperationLocks<T>(
  options: OperationLockOptions,
  operation: () => Promise<T>
): Promise<T> {
  await mkdir(options.cwd, { recursive: true });
  await mkdir(options.store, { recursive: true });
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = Math.max(1, Math.ceil(timeoutMs / 250));
  const projectLockPath = join(options.cwd, '.leogriel-operation.lock');
  const storeLockPath = join(options.store, '.leogriel-store.lock');
  let releaseProject: (() => Promise<void>) | undefined;
  let releaseStore: (() => Promise<void>) | undefined;
  try {
    releaseProject = await acquire(options.cwd, projectLockPath, retries);
    releaseStore = await acquire(options.store, storeLockPath, retries);
    return await operation();
  } catch (err) {
    if (isLockError(err)) throw new OperationLockError(!releaseProject ? projectLockPath : storeLockPath, err);
    throw err;
  } finally {
    if (releaseStore) await releaseStore().catch(() => {});
    if (releaseProject) await releaseProject().catch(() => {});
  }
}

async function acquire(target: string, lockfilePath: string, retries: number): Promise<() => Promise<void>> {
  return lockfile.lock(target, {
    realpath: false,
    lockfilePath,
    stale: 30_000,
    update: 10_000,
    retries: { retries, factor: 1, minTimeout: 250, maxTimeout: 250 },
  });
}

function isLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'ELOCKED' || code === 'ENOTACQUIRED';
}
