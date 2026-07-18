/**
 * OpenCode Adapter.
 * Paths per design:
 *   global: ~/.config/opencode/skills
 *   project: .opencode/skills
 */
import { BaseAgentAdapter, join, homedir, basicDetect } from '../base/index.js';
import type { AgentAdapter } from '@leogriel/core';
import { pathExists } from '@leogriel/link-manager';

export class OpenCodeAdapter extends BaseAgentAdapter implements AgentAdapter {
  constructor() {
    super(
      'opencode',
      'OpenCode',
      ['.opencode/skills'],
      [join(homedir(), '.config', 'opencode', 'skills')]
    );
  }

  async detect(): Promise<boolean> {
    const cwd = process.cwd();
    const project = join(cwd, '.opencode');
    const globalConfig = join(homedir(), '.config', 'opencode');
    if ((await pathExists(project)) || (await pathExists(globalConfig))) {
      return true;
    }
    return basicDetect(this.projectPaths, this.globalPaths);
  }
}

export const opencodeAdapter = new OpenCodeAdapter();
