import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/http.ts";
import { env } from "../lib/config.ts";
import type { RawItem } from "../lib/types.ts";

const BASE = "https://ndlsearch.ndl.go.jp/api/opensearch";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

type NdlItem = {
  title?: string;
  link?: string;
  description?: string;
  "dc:creator"?: string;
  "dc:date"?: string;
  "dc:identifier"?: string;
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export async function fetchNdl(options: { queries: string[] }): Promise<RawItem[]> {
  const appid = env("NDL_APPID");
  if (!appid) {
    console.log("[ndl] NDL_APPID not set; skipping National Diet Library");
    return [];
  }
  const items: RawItem[] = [];
  for (const query of options.queries) {
    const params = new URLSearchParams({ appid, any: query, cnt: "50" });
    try {
      const xml = await fetchText(`${BASE}?${params.toString()}`, { cacheTtlMs: 6 * 60 * 60 * 1000 });
      const parsed = parser.parse(xml) as { rss?: { channel?: { item?: NdlItem | NdlItem[] } } };
      for (const entry of asArray(parsed.rss?.channel?.item)) {
        const title = (entry.title ?? "").trim();
        const url = entry.link;
        if (!title || !url) continue;
        items.push({
          source: "ndl",
          type: "book",
          title,
          lang: "ja",
          authors: entry["dc:creator"] ? [entry["dc:creator"]] : [],
          publishedAt: entry["dc:date"],
          url,
          abstract: entry.description,
        });
      }
    } catch (error) {
      console.warn(`[ndl] query failed (${query}):`, (error as Error).message);
    }
  }
  console.log(`[ndl] ${items.length} records`);
  return items;
}
