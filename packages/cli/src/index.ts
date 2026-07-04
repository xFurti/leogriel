#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json (works in built dist and source)
const pkgPath = join(__dirname, '..', 'package.json');
let version = '0.0.1';
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkg.version || version;
} catch {
  // fallback in case of packaging layout
}

const program = new Command();

program
  .name('skillctl')
  .description('Universal package-manager-like CLI for Agent Skills')
  .version(version, '-v, --version', 'output the current version')
  .helpOption('-h, --help', 'display help for command');

// No commands registered yet (added in later PRs)
// This establishes the basic skeleton and --help/--version behavior.

program.parse(process.argv);
