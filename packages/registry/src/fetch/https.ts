import https from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export interface HttpResponse {
  status: number;
  body: Buffer;
  finalUrl: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export function leogrielUserAgent(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version?: string };
    if (pkg.version) return `leogriel/${pkg.version}`;
  } catch {
    // fallback if package.json unavailable at runtime
  }
  return 'leogriel/unknown';
}

export class NodeHttpsClient implements HttpClient {
  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    return request(url, options, options.maxRedirects ?? DEFAULT_MAX_REDIRECTS);
  }
}

export const defaultHttpClient: HttpClient = new NodeHttpsClient();

async function request(
  url: string,
  options: HttpRequestOptions,
  redirectsLeft: number
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error(`Refusing non-HTTPS download: ${url}`));
      return;
    }

    const req = https.get(
      parsed,
      { headers: { 'User-Agent': leogrielUserAgent(), ...(options.headers || {}) } },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const next = new URL(res.headers.location, parsed).toString();
          request(next, options, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            res.destroy(new Error(`Download exceeds ${maxBytes} bytes: ${url}`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status,
            body: Buffer.concat(chunks),
            finalUrl: parsed.toString(),
            headers: res.headers,
          });
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(options.timeoutMs ?? 30_000, () => {
      req.destroy(new Error(`HTTP timeout for ${url}`));
    });
  });
}

export async function httpsGet(
  url: string,
  headers: Record<string, string> = {},
  client: HttpClient = defaultHttpClient
): Promise<Buffer> {
  const response = await client.get(url, { headers });
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.body;
}
