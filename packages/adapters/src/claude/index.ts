/**
 * Claude Code Adapter.
 * Paths per design + agentskills:
 *   global: ~/.claude/skills
 *   project: .claude/skills
 */
import { BaseAgentAdapter, join, homedir, basicDetect } from '../base/index.js';
import type { AgentAdapter } from '@leogriel/core';
import { pathExists } from '@leogriel/link-manager';

export class ClaudeAdapter extends BaseAgentAdapter implements AgentAdapter {
  constructor() {
    super(
      'claude-code',
      'Claude Code',
      ['.claude/skills'],
      [join(homedir(), '.claude', 'skills')]
    );
  }

  // override detect for claude specific (also check ~/.claude dir existence as proxy)
  async detect(): Promise<boolean> {
    const cwd = process.cwd();
    const project = join(cwd, '.claude');
    const global = join(homedir(), '.claude');
    if ((await pathExists(project)) || (await pathExists(global))) {
      return true;
    }
    return basicDetect(this.projectPaths, this.globalPaths);
  }
}

export const claudeAdapter = new ClaudeAdapter();
