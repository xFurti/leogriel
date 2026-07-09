import type { Command } from 'commander';

export interface CliIssue {
  code: string;
  message: string;
  details?: unknown;
}

export interface CliEnvelope<T> {
  schemaVersion: 1;
  ok: boolean;
  command: string;
  data: T | null;
  warnings: CliIssue[];
  errors: CliIssue[];
}

export async function runCli(program: Command, argv = process.argv): Promise<void> {
  if (!argv.includes('--json')) {
    await program.parseAsync(argv);
    return;
  }

  const original = { log: console.log, warn: console.warn, error: console.error };
  const messages: string[] = [];
  const warningMessages: string[] = [];
  const errorMessages: string[] = [];
  console.log = (...args: unknown[]) => messages.push(formatArgs(args));
  console.warn = (...args: unknown[]) => warningMessages.push(formatArgs(args));
  console.error = (...args: unknown[]) => errorMessages.push(formatArgs(args));

  try {
    await program.parseAsync(argv);
  } catch (err) {
    errorMessages.push(err instanceof Error ? err.message : String(err));
    process.exitCode = process.exitCode || 2;
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  const parsedData = parseSingleStructuredMessage(messages);
  const errors = errorMessages.map((message) => ({ code: 'COMMAND_ERROR', message }));
  const warnings = warningMessages.map((message) => ({ code: 'COMMAND_WARNING', message }));
  const currentExitCode = numericExitCode();
  if (errors.length && currentExitCode < 2) process.exitCode = 2;
  else if (warnings.length && !process.exitCode) process.exitCode = 1;

  const envelope: CliEnvelope<unknown> = {
    schemaVersion: 1,
    ok: errors.length === 0 && numericExitCode() < 2,
    command: commandName(argv),
    data: parsedData ?? (messages.length ? { messages } : null),
    warnings,
    errors,
  };
  original.log(JSON.stringify(envelope, null, 2));
}

function numericExitCode(): number {
  if (typeof process.exitCode === 'number') return process.exitCode;
  if (typeof process.exitCode === 'string') return Number.parseInt(process.exitCode, 10) || 0;
  return 0;
}

function formatArgs(args: unknown[]): string {
  return args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
}

function parseSingleStructuredMessage(messages: string[]): unknown | undefined {
  if (messages.length !== 1) return undefined;
  try {
    return JSON.parse(messages[0]);
  } catch {
    return undefined;
  }
}

function commandName(argv: string[]): string {
  const tokens = argv.slice(2).filter((arg) => !arg.startsWith('-'));
  if (!tokens.length) return 'help';
  if (['import', 'plugin', 'skill'].includes(tokens[0]) && tokens[1]) return `${tokens[0]} ${tokens[1]}`;
  return tokens[0];
}
