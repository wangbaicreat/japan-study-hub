import fs from "node:fs";
import path from "node:path";
import { paths } from "../lib/paths.ts";
import type { RawItem } from "../lib/types.ts";

/**
 * Escape hatch for anything the APIs miss (CNKI-only articles, a book you saw
 * in a publisher catalogue). Drop `data/manual/*.json` files containing an
 * array of RawItem-shaped objects; they are merged like any other source.
 */
export function fetchManual(): RawItem[] {
  const dir = path.join(paths.data, "manual");
  if (!fs.existsSync(dir)) return [];
  const items: RawItem[] = [];
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as RawItem[];
      for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!entry?.title || !entry?.url) continue;
        items.push({ ...entry, source: entry.source ?? "manual", type: entry.type ?? "article" });
      }
    } catch (error) {
      console.warn(`[manual] could not read ${name}:`, (error as Error).message);
    }
  }
  if (items.length > 0) console.log(`[manual] ${items.length} hand-added records`);
  return items;
}
