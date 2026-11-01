import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.ts";
import type { Digest, Item } from "./types.ts";

export function ensureDirs(): void {
  for (const dir of [paths.data, paths.items, paths.digests, paths.jstor, paths.cache, paths.outbox]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Append normalised items to the monthly shard, skipping ids already stored. */
export function appendItems(date: string, items: Item[]): number {
  const file = path.join(paths.items, `${monthKey(date)}.jsonl`);
  const seen = new Set<string>();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        seen.add((JSON.parse(line) as Item).id);
      } catch {
        // ignore corrupt line
      }
    }
  }
  const fresh = items.filter((item) => !seen.has(item.id));
  if (fresh.length === 0) return 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, fresh.map((item) => JSON.stringify(item)).join("\n") + "\n");
  return fresh.length;
}

export function readItemsSince(sinceDate: string): Item[] {
  const start = new Date(`${sinceDate}T00:00:00Z`);
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const now = new Date();
  while (cursor <= now) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const items: Item[] = [];
  for (const month of months) {
    const file = path.join(paths.items, `${month}.jsonl`);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        items.push(JSON.parse(line) as Item);
      } catch {
        // ignore corrupt line
      }
    }
  }
  return items;
}

export function digestPath(date: string): string {
  return path.join(paths.digests, `${date}.json`);
}

export function writeDigest(digest: Digest): void {
  writeJson(digestPath(digest.date), digest);
}

export function readDigest(date: string): Digest | undefined {
  try {
    return JSON.parse(fs.readFileSync(digestPath(date), "utf8")) as Digest;
  } catch {
    return undefined;
  }
}

export function listDigests(): Digest[] {
  if (!fs.existsSync(paths.digests)) return [];
  return fs
    .readdirSync(paths.digests)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .map((name) => readDigest(name.replace(/\.json$/, "")))
    .filter((digest): digest is Digest => Boolean(digest));
}

export function loadSeen(): Set<string> {
  const data = readJson<{ ids: string[] }>(paths.seen, { ids: [] });
  return new Set(data.ids);
}

export function saveSeen(seen: Set<string>): void {
  writeJson(paths.seen, { ids: [...seen].slice(-20_000) });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, delta: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}
