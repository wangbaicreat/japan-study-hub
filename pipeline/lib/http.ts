import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.ts";
import { sha1 } from "./util.ts";

const UA = "nihon-digest/0.1 (academic digest; contact: local)";

export type FetchOptions = {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  /** Cache successful responses on disk for this long. 0 disables caching. */
  cacheTtlMs?: number;
  method?: string;
  body?: string;
};

type CacheEntry = { fetchedAt: number; status: number; body: string };

function cacheFile(url: string): string {
  return path.join(paths.cache, "http", `${sha1(url)}.json`);
}

function readCache(url: string, ttlMs: number): string | undefined {
  if (ttlMs <= 0) return undefined;
  try {
    const entry = JSON.parse(fs.readFileSync(cacheFile(url), "utf8")) as CacheEntry;
    if (Date.now() - entry.fetchedAt > ttlMs) return undefined;
    return entry.body;
  } catch {
    return undefined;
  }
}

function writeCache(url: string, body: string): void {
  const file = cacheFile(url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry: CacheEntry = { fetchedAt: Date.now(), status: 200, body };
  fs.writeFileSync(file, JSON.stringify(entry));
}

function backoffMs(attempt: number, retryAfter?: string | null): number {
  const retry = retryAfter ? Number(retryAfter) * 1000 : 0;
  if (Number.isFinite(retry) && retry > 0) return Math.min(retry, 20_000);
  return Math.min(1000 * 2 ** attempt, 8000);
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { timeoutMs = 25_000, retries = 2, headers = {}, cacheTtlMs = 0 } = options;

  const cached = readCache(url, cacheTtlMs);
  if (cached !== undefined) return cached;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        body: options.body,
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "*/*", ...headers },
      });
      if (response.status === 429 || response.status >= 500) {
        const delay = backoffMs(attempt, response.headers.get("retry-after"));
        lastError = new Error(`HTTP ${response.status} for ${url}`);
        clearTimeout(timer);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const text = await response.text();
      if (cacheTtlMs > 0) writeCache(url, text);
      return text;
    } catch (error) {
      lastError = error;
      clearTimeout(timer);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  return JSON.parse(text) as T;
}

/** HEAD check used before publishing; 403 usually means "exists but bot-blocked". */
export async function urlAlive(url: string, timeoutMs = 12_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "user-agent": UA },
      redirect: "follow",
    });
    return response.ok || response.status === 403 || response.status === 405;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
