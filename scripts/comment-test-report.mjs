import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER } from './render-test-report.mjs';

const MAX_COMMENT_CHARS = 60_000;

export async function upsertReportComment({ token, repository, pullRequest, body, request = fetch }) {
  if (!token) throw new Error('comment-on-pr requires the github-token input');
  if (!/^[^/]+\/[^/]+$/.test(repository || '')) throw new Error('Invalid GitHub repository identifier');
  if (!Number.isInteger(pullRequest) || pullRequest < 1) throw new Error('Invalid pull-request number');
  if (!body.includes(MARKER)) throw new Error('Refusing to publish an unmarked report');
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
  };
  const base = `https://api.github.com/repos/${repository}`;
  const listed = await request(`${base}/issues/${pullRequest}/comments?per_page=100`, { headers });
  if (!listed.ok) throw new Error(`GitHub comment lookup failed with HTTP ${listed.status}`);
  const comments = await listed.json();
  if (!Array.isArray(comments)) throw new Error('GitHub comment lookup returned invalid JSON');
  const existing = comments.find((comment) => typeof comment?.body === 'string' && comment.body.includes(MARKER));
  const limitedBody = body.length <= MAX_COMMENT_CHARS
    ? body
    : `${body.slice(0, MAX_COMMENT_CHARS - 120)}\n\n_Report truncated; download the workflow artifact for full details._\n`;
  const url = existing ? `${base}/issues/comments/${existing.id}` : `${base}/issues/${pullRequest}/comments`;
  const response = await request(url, {
    method: existing ? 'PATCH' : 'POST',
    headers,
    body: JSON.stringify({ body: limitedBody }),
  });
  if (!response.ok) throw new Error(`GitHub comment ${existing ? 'update' : 'creation'} failed with HTTP ${response.status}`);
  return { action: existing ? 'updated' : 'created', id: (await response.json())?.id };
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const reportPath = argv[0];
  if (!reportPath) throw new Error('Usage: comment-test-report.mjs <report.md>');
  const body = await readFile(reportPath, 'utf8');
  const result = await upsertReportComment({
    token: environment.GH_TOKEN,
    repository: environment.LEOGRIEL_REPOSITORY,
    pullRequest: Number.parseInt(environment.LEOGRIEL_PR_NUMBER || '', 10),
    body,
  });
  process.stdout.write(`Leogriel pull-request comment ${result.action}.\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });

export { main };
