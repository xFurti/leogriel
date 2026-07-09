import type { RegistrySource, ResolvedSource } from '@skillctl/core';
import { GitHubSource } from './github.js';
import { defaultHttpClient, type HttpClient } from '../fetch/https.js';

export class SkillsShSource implements RegistrySource {
  readonly id = 'skills.sh';

  constructor(private readonly httpClient: HttpClient = defaultHttpClient) {}

  match(spec: string): boolean {
    return spec.startsWith('skills.sh/') || spec.startsWith('npx-skills/');
  }

  async resolve(spec: string, options?: { ref?: string }): Promise<ResolvedSource> {
    const inner = spec.replace(/^skills\.sh\//, '').replace(/^npx-skills\//, '');

    if (!inner.includes('/')) {
      throw new Error(
        `skills.sh name-only spec "${inner}" requires owner/repo form (e.g. skills.sh/vercel-labs/agent-skills). ` +
          `Use github:owner/repo or add via npx skills import.`
      );
    }

    const gh = new GitHubSource(this.httpClient);
    const resolvedGh = await gh.resolve(`github:${inner}`, options);
    return {
      ...resolvedGh,
      sourceType: 'skills.sh',
      sourceId: this.id,
      originalSpec: spec,
      resolved: resolvedGh.resolved.replace('github:', 'skills.sh/'),
    };
  }

  async fetch(resolved: ResolvedSource, dest: string): Promise<{ integrity: string }> {
    return new GitHubSource(this.httpClient).fetch(resolved, dest);
  }
}
