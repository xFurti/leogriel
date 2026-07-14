import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogProvider, CatalogSearchOptions, CatalogSearchResult } from '@skillctl/core';
import { ensureCacheDir, writeFileAtomic } from '@skillctl/core';
import { defaultHttpClient, type HttpClient, type HttpResponse } from './fetch/https.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
const OWNER_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38})$/i;

export class CatalogManager {
  private readonly providers: CatalogProvider[] = [];

  constructor(providers: CatalogProvider[] = [new SkillsShCatalogProvider()]) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: CatalogProvider): void {
    if (this.providers.some((registered) => registered.id === provider.id)) {
      throw new Error(`Catalog provider already registered: ${provider.id}`);
    }
    this.providers.push(provider);
  }

  getProviders(): CatalogProvider[] {
    return [...this.providers];
  }

  async search(query: string, options?: CatalogSearchOptions): Promise<CatalogSearchResult[]> {
    const selected = options?.provider
      ? this.providers.filter((provider) => provider.id === options.provider)
      : this.providers;
    if (!selected.length) throw new Error(`Unknown catalog provider: ${options?.provider}`);
    const results = await Promise.all(selected.map(async (provider) =>
      (await provider.search(query, options)).map((result) => normalizeResult(result, provider.id, Boolean(result.stale)))));
    return results.flat().sort((a, b) =>
      ((b.popularity?.value ?? b.installs ?? 0) - (a.popularity?.value ?? a.installs ?? 0))
      || a.name.localeCompare(b.name)
      || a.id.localeCompare(b.id));
  }
}

export class SkillsShCatalogProvider implements CatalogProvider {
  readonly id = 'skills.sh';

  constructor(
    private readonly httpClient: HttpClient = defaultHttpClient,
    private readonly options: { baseUrl?: string; cacheDir?: string; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  async search(query: string, options: CatalogSearchOptions = {}): Promise<CatalogSearchResult[]> {
    const normalized = query.trim();
    if (normalized.length < 2) throw new Error('Search query must contain at least 2 characters');
    const limit = options.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Search limit must be between 1 and 50');
    if (options.owner && !OWNER_PATTERN.test(options.owner)) throw new Error('Owner must be a valid GitHub owner');

    const cachePath = await this.cachePath(normalized, options);
    const cached = await this.readCache(cachePath);
    if (cached && this.now() - cached.savedAt < CACHE_TTL_MS) {
      return cached.results.map((result) => normalizeResult(result, this.id, Boolean(result.stale)));
    }

    try {
      const params = new URLSearchParams({ q: normalized, limit: String(limit) });
      if (options.owner) params.set('owner', options.owner.toLowerCase());
      const base = this.options.baseUrl || process.env.SKILLCTL_SKILLS_API_URL || 'https://skills.sh';
      const response = await this.requestWithRetry(`${base.replace(/\/$/, '')}/api/search?${params}`);
      if (response.status !== 200) throw new Error(`skills.sh search returned HTTP ${response.status}`);
      const results = parseSearchResponse(response.body, limit);
      await writeFileAtomic(cachePath, `${JSON.stringify({ savedAt: this.now(), results })}\n`);
      return results;
    } catch (err) {
      if (cached) return cached.results.map((result) => normalizeResult(result, this.id, true));
      throw err;
    }
  }

  private async requestWithRetry(url: string): Promise<HttpResponse> {
    let response = await this.httpClient.get(url, { timeoutMs: 8_000, maxBytes: 2 * 1024 * 1024 });
    if (response.status === 429 || response.status >= 500) {
      const raw = response.headers['retry-after'];
      const seconds = Number.parseInt(Array.isArray(raw) ? raw[0] || '0' : raw || '0', 10);
      await (this.options.sleep || defaultSleep)(Math.min(Number.isFinite(seconds) ? seconds * 1000 : 250, 5_000));
      response = await this.httpClient.get(url, { timeoutMs: 8_000, maxBytes: 2 * 1024 * 1024 });
    }
    return response;
  }

  private async cachePath(query: string, options: CatalogSearchOptions): Promise<string> {
    const dir = this.options.cacheDir || await ensureCacheDir('catalog');
    const key = Buffer.from(JSON.stringify({ query, owner: options.owner, limit: options.limit ?? 10 })).toString('base64url');
    return join(dir, `skills-sh-${key}.json`);
  }

  private async readCache(path: string): Promise<{ savedAt: number; results: CatalogSearchResult[] } | null> {
    if (!(await stat(path).catch(() => null))) return null;
    try {
      const value = JSON.parse(await readFile(path, 'utf8'));
      if (!Number.isFinite(value.savedAt) || !Array.isArray(value.results)) return null;
      return value;
    } catch {
      return null;
    }
  }

  private now(): number {
    return (this.options.now || Date.now)();
  }
}

function parseSearchResponse(body: Buffer, limit: number): CatalogSearchResult[] {
  const value = JSON.parse(body.toString('utf8')) as { skills?: unknown };
  if (!Array.isArray(value.skills)) throw new Error('skills.sh returned an invalid search response');
  return value.skills.slice(0, limit).map((item) => {
    if (!item || typeof item !== 'object') throw new Error('skills.sh returned an invalid skill entry');
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.source !== 'string') {
      throw new Error('skills.sh search entry is missing id, name, or source');
    }
    const sourceId = entry.id.replace(/^\/+|\/+$/g, '');
    const installs = typeof entry.installs === 'number' ? entry.installs : undefined;
    const updatedAt = typeof entry.updatedAt === 'string' && !Number.isNaN(Date.parse(entry.updatedAt))
      ? new Date(entry.updatedAt).toISOString()
      : undefined;
    return {
      id: `skills.sh:${sourceId}`,
      provider: 'skills.sh',
      name: entry.name,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      owner: typeof entry.owner === 'string' ? entry.owner : sourceId.split('/')[0],
      source: entry.source,
      installs,
      popularity: installs === undefined ? undefined : { metric: 'installs', value: installs },
      sourceType: 'skills.sh',
      installSpecifier: `skills.sh/${sourceId}`,
      updatedAt,
      stale: false,
      url: `https://skills.sh/${sourceId}`,
    };
  });
}

function normalizeResult(result: CatalogSearchResult, provider: string, stale: boolean): CatalogSearchResult {
  const rawId = result.id.startsWith(`${provider}:`) ? result.id : `${provider}:${result.id}`;
  return {
    ...result,
    id: rawId,
    provider,
    stale,
    popularity: result.popularity || (result.installs === undefined ? undefined : { metric: 'installs', value: result.installs }),
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
