import type { Command } from 'commander';
import { loadManifest, createDefaultManifest, saveManifest } from '@skillctl/manifest';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize agent-skills.json in current project')
    .action(async () => {
      const existing = await loadManifest();
      if (existing) {
        console.log('agent-skills.json already exists');
        return;
      }
      const sample = createDefaultManifest('demo-project');
      await saveManifest(sample);
      console.log('Created agent-skills.json');
      console.log('Run `skillctl add <spec>` to populate, then `install` or `sync`.');
    });
}