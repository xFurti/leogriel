import { join } from 'node:path';
import { homedir } from 'node:os';
import { createPathAdapter } from '../factory.js';

export const codexAdapter = createPathAdapter({
  id: 'codex',
  name: 'Codex',
  projectPaths: ['.codex/skills'],
  globalPaths: [join(homedir(), '.codex', 'skills')],
  detectDirs: ['.codex', join(homedir(), '.codex')],
});