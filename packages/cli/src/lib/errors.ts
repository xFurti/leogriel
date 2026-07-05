export function handleCommandError(err: unknown, label: string): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${label} failed:`, message);
  process.exitCode = 1;
}