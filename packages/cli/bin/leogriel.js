#!/usr/bin/env node
import { prepareProgram } from '../dist/index.js';
import { runCli } from '../dist/lib/output.js';

const program = await prepareProgram();

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}
await runCli(program, process.argv);
