import { join } from 'node:path';
import { homedir } from 'node:os';
import { createPathAdapter } from '../factory.js';

export const geminiAdapter = createPathAdapter({
  id: 'gemini-cli',
  name: 'Gemini CLI',
  projectPaths: ['.gemini/skills'],
  globalPaths: [join(homedir(), '.gemini', 'skills')],
  detectDirs: ['.gemini', join(homedir(), '.gemini')],
});