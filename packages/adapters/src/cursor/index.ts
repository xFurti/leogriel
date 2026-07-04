/**
 * Cursor Adapter.
 * Paths:
 *   global: ~/.cursor/skills
 *   project: .agents/skills   (note: .agents/skills is de-facto universal too, coexistence relevant)
 */
import { BaseAgentAdapter, join, homedir, basicDetect } from '../base/index.js';
import type { AgentAdapter } from '@skillctl/core';
import { pathExists } from '@skillctl/link-manager';

export class CursorAdapter extends BaseAgentAdapter implements AgentAdapter {
  constructor() {
    super(
      'cursor',
      'Cursor',
      ['.agents/skills'],
      [join(homedir(), '.cursor', 'skills')]
    );
  }

  async detect(): Promise<boolean> {
    const cwd = process.cwd();
    // cursor often uses .cursor or .agents
    const projectAgents = join(cwd, '.agents');
    const projectCursor = join(cwd, '.cursor');
    const global = join(homedir(), '.cursor');
    if ((await pathExists(projectAgents)) || (await pathExists(projectCursor)) || (await pathExists(global))) {
      return true;
    }
    return basicDetect(this.projectPaths, this.globalPaths);
  }
}

export const cursorAdapter = new CursorAdapter();
