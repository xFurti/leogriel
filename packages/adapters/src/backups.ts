import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { canonicalizeName, computeDirIntegrity, findLeogrielProject, getRegisteredAdapters } from '@leogriel/core';

export type BackupScope = 'project' | 'global';

export interface BackupRecord {
  id: string;
  filesystemId: string;
  scope: BackupScope;
  adapter: string;
  skill: string;
  originalPath: string;
  contentPath: string;
  integrity?: string;
  timestamp: string;
  command: string;
  metadataPath: string;
}

export async function listBackups(options: { scope?: BackupScope; cwd?: string } = {}): Promise<BackupRecord[]> {
  const scope = options.scope || 'project';
  const projectRoot = scope === 'project' ? await findLeogrielProject(options.cwd || process.cwd()) : null;
  if (scope === 'project' && !projectRoot) return [];
  const root = backupRoot(scope, projectRoot || options.cwd);
  const metadata = await findMetadata(root);
  const records = await Promise.all(metadata.map((path) => readBackup(path, scope, root, projectRoot)));
  return records.filter((record): record is BackupRecord => Boolean(record)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function getBackup(id: string, options: { cwd?: string } = {}): Promise<BackupRecord | null> {
  const scope = id.startsWith('global:') ? 'global' : 'project';
  return (await listBackups({ scope, cwd: options.cwd })).find((record) => record.id === id) || null;
}

export async function restoreBackup(
  id: string,
  options: { cwd?: string; dryRun?: boolean } = {},
): Promise<{ backup: BackupRecord; restored: boolean }> {
  const backup = await getBackup(id, options);
  if (!backup) throw new Error(`Backup not found: ${id}`);
  await verifyBackup(backup);
  if (options.dryRun) return { backup, restored: false };
  const rollback = `${backup.originalPath}.leogriel-restore-${randomUUID()}`;
  const existing = await lstat(backup.originalPath).catch(() => null);
  if (existing) await rename(backup.originalPath, rollback);
  try {
    await mkdir(dirname(backup.originalPath), { recursive: true });
    await cp(backup.contentPath, backup.originalPath, { recursive: true, force: true, verbatimSymlinks: true });
    if (backup.integrity && await computeDirIntegrity(backup.originalPath) !== backup.integrity) {
      throw new Error('Restored backup integrity mismatch');
    }
    if (existing) await rm(rollback, { recursive: true, force: true });
    return { backup, restored: true };
  } catch (error) {
    await rm(backup.originalPath, { recursive: true, force: true }).catch(() => {});
    if (existing) await rename(rollback, backup.originalPath).catch(() => {});
    throw error;
  }
}

export async function removeBackup(id: string, options: { cwd?: string; dryRun?: boolean } = {}): Promise<{ backup: BackupRecord; removed: boolean }> {
  const backup = await getBackup(id, options);
  if (!backup) throw new Error(`Backup not found: ${id}`);
  await verifyBackup(backup);
  if (options.dryRun) return { backup, removed: false };
  const directory = dirname(backup.metadataPath);
  await rm(directory, { recursive: true, force: true });
  return { backup, removed: true };
}

async function verifyBackup(backup: BackupRecord): Promise<void> {
  if (!(await lstat(backup.contentPath).catch(() => null))) throw new Error(`Backup content is missing: ${backup.id}`);
  if (backup.integrity && await computeDirIntegrity(backup.contentPath) !== backup.integrity) {
    throw new Error(`Backup integrity mismatch: ${backup.id}`);
  }
}

async function readBackup(metadataPath: string, scope: BackupScope, root: string, projectRoot: string | null): Promise<BackupRecord | null> {
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>;
    const directory = dirname(metadataPath);
    assertBackupPathInside(root, metadataPath);
    const parts = relative(root, metadataPath).split(/[\\/]/);
    if (parts.length !== 4 || parts[3] !== 'metadata.json') throw new Error('Invalid backup directory layout');
    const [directoryId, directoryAdapter, directorySkill] = parts;
    if (metadata.version !== 1 || metadata.scope !== scope) throw new Error('Invalid backup metadata version or scope');
    if (typeof metadata.filesystemId !== 'string' || !/^[a-z0-9._-]+$/i.test(metadata.filesystemId) || metadata.filesystemId !== directoryId) throw new Error('Invalid backup filesystemId');
    if (typeof metadata.adapter !== 'string' || metadata.adapter !== directoryAdapter) throw new Error('Invalid backup adapter');
    if (typeof metadata.skill !== 'string' || canonicalizeName(metadata.skill) !== metadata.skill || metadata.skill !== directorySkill) throw new Error('Invalid backup skill');
    const adapter = getRegisteredAdapters().find((candidate) => candidate.id === metadata.adapter);
    if (!adapter) throw new Error('Unknown backup adapter');
    const skill = metadata.skill;
    const filesystemId = metadata.filesystemId;
    const id = `${scope}:${filesystemId}:${adapter.id}:${skill}`;
    if (metadata.id !== id) throw new Error('Invalid backup logical ID');
    if (typeof metadata.timestamp !== 'string' || Number.isNaN(Date.parse(metadata.timestamp))) throw new Error('Invalid backup timestamp');
    if (typeof metadata.command !== 'string' || !metadata.command.trim()) throw new Error('Invalid backup command');
    if (typeof metadata.integrity !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(metadata.integrity)) throw new Error('Invalid backup integrity');
    if (typeof metadata.originalPath !== 'string' || !isAbsolute(metadata.originalPath)) throw new Error('Invalid backup originalPath');
    const allowed = scope === 'project'
      ? adapter.projectPaths.map((base) => resolve(projectRoot!, base, skill))
      : adapter.globalPaths.map((base) => resolve(base, skill));
    if (!allowed.some((candidate) => samePath(candidate, metadata.originalPath as string))) throw new Error('Backup originalPath is not an adapter target');
    const contentPath = join(directory, 'content');
    return {
      id, filesystemId, scope, adapter: adapter.id, skill,
      originalPath: resolve(metadata.originalPath), contentPath,
      integrity: metadata.integrity,
      timestamp: metadata.timestamp, command: metadata.command, metadataPath,
    };
  } catch { return null; }
}

async function findMetadata(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && entry.name === 'metadata.json') result.push(child);
    }
  }
  await walk(root);
  return result;
}

function backupRoot(scope: BackupScope, cwd = process.cwd()): string {
  const root = scope === 'global' ? join(homedir(), '.leogriel') : resolve(cwd, '.leogriel');
  return join(root, 'backups', 'sync');
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function assertBackupPathInside(root: string, candidate: string): void {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Backup path escapes its root');
}
