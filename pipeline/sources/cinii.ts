import { fetchJson } from "../lib/http.ts";
import { env } from "../lib/config.ts";
import type { RawItem } from "../lib/types.ts";

const BASE = "https://cir.nii.ac.jp/opensearch/all";

type CiniiEntry = {
  title?: string;
  "dc:creator"?: string | string[];
  "prism:publicationName"?: string;
  "prism:publicationDate"?: string;
  "dc:identifier"?: string;
  link?: { "@_href"?: string } | { "@_href"?: string }[];
  description?: string;
};

type CiniiResponse = { items?: CiniiEntry[] };

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export async function fetchCinii(options: {
  queries: string[];
  lookbackDays: number;
}): Promise<RawItem[]> {
  const appid = env("CINII_APPID");
  if (!appid) {
    console.log("[cinii] CINII_APPID not set; skipping CiNii Research");
    return [];
  }
  const since = new Date(Date.now() - options.lookbackDays * 86_400_000);
  const items: RawItem[] = [];

  for (const query of options.queries) {
    const params = new URLSearchParams({
      appid,
      q: query,
      format: "json",
      count: "50",
      sortorder: "3",
    });
    try {
      const data = await fetchJson<CiniiResponse>(`${BASE}?${params.toString()}`, {
        cacheTtlMs: 6 * 60 * 60 * 1000,
      });
      for (const entry of data.items ?? []) {
        const title = (entry.title ?? "").trim();
        if (!title) continue;
        const date = entry["prism:publicationDate"];
        if (date && new Date(date) < since) continue;
        const links = asArray(entry.link);
        const url = links[0]?.["@_href"] ?? entry["dc:identifier"];
        if (!url) continue;
        items.push({
          source: "cinii",
          type: "article",
          title,
          lang: "ja",
          authors: asArray(entry["dc:creator"]),
          publishedAt: date,
          venueName: entry["prism:publicationName"],
          url,
          abstract: entry.description,
        });
      }
    } catch (error) {
      console.warn(`[cinii] query failed (${query}):`, (error as Error).message);
    }
  }
  console.log(`[cinii] ${items.length} records`);
  return items;
}
