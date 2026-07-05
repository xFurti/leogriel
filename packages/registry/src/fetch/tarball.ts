import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import * as tar from 'tar';
import { getCachedDownload, putCachedDownload } from '@skillctl/core';
import { httpsGet } from './https.js';

export function computeSha1(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex');
}

export async function fetchCachedBuffer(key: string, url: string, headers?: Record<string, string>): Promise<Buffer> {
  const cached = await getCachedDownload(key);
  if (cached) return readFile(cached);

  const buf = await httpsGet(url, headers);
  const tmp = join(tmpdir(), `dl-${Date.now()}.tgz`);
  await writeFile(tmp, buf);
  await putCachedDownload(key, tmp).catch(() => {});
  await rm(tmp, { force: true }).catch(() => {});
  return buf;
}

export async function extractTarball(buf: Buffer, dest: string, strip = 1): Promise<void> {
  const tarTmp = `${dest}.tar.gz`;
  await writeFile(tarTmp, buf);
  await tar.extract({ file: tarTmp, cwd: dest, strip });
  await rm(tarTmp, { force: true });
}