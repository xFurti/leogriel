export class LeogrielError extends Error {
  constructor(
    message: string,
    readonly code = 'LEOGRIEL_ERROR',
    readonly exitCode: 1 | 2 = 2,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'LeogrielError';
  }
}

export function handleCommandError(err: unknown, label: string): void {
  const message = err instanceof Error ? err.message : String(err);
  addCliIssue('error', {
    code: err instanceof LeogrielError ? err.code : 'COMMAND_ERROR',
    message: `${label} failed: ${message}`,
    details: err instanceof LeogrielError ? err.details : undefined,
  });
  process.exitCode = err instanceof LeogrielError ? err.exitCode : 2;
}
import { addCliIssue } from './output.js';
