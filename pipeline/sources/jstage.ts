import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/http.ts";
import type { RawItem } from "../lib/types.ts";

const BASE = "https://api.jstage.jst.go.jp/searchapi/do";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

type JStageEntry = {
  article_title?: { ja?: string; en?: string };
  article_link?: { ja?: string; en?: string };
  author?: { ja?: { name?: string } | { name?: string }[]; en?: { name?: string } | { name?: string }[] };
  material_title?: { ja?: string; en?: string };
  pubyear?: string | number;
  "prism:doi"?: string;
  link?: string | { "@_href"?: string; "#text"?: string };
  id?: string;
};

function textOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function pickLang(value?: { ja?: string; en?: string } | string): string | undefined {
  if (typeof value === "string") return textOf(value);
  return textOf(value?.ja) ?? textOf(value?.en);
}

function authorsOf(entry: JStageEntry): string[] {
  const names: string[] = [];
  for (const group of [entry.author?.ja, entry.author?.en]) {
    for (const author of asArray(group)) {
      const name = textOf(author?.name);
      if (name) names.push(name);
    }
  }
  return [...new Set(names)];
}

function linkOf(entry: JStageEntry): string | undefined {
  const direct = entry.article_link?.ja ?? entry.article_link?.en;
  if (typeof direct === "string") return direct;
  const link = entry.link;
  if (typeof link === "string") return link;
  if (link && typeof link === "object" && link["@_href"]) return link["@_href"];
  return typeof entry.id === "string" ? entry.id : undefined;
}

export async function fetchJStage(options: { keywords: string[]; count: number }): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const minYear = new Date().getFullYear() - 2;

  for (const keyword of options.keywords) {
    const url =
      `${BASE}?service=3&article=${encodeURIComponent(keyword)}` +
      `&count=${options.count}&sort=3`;
    try {
      const xml = await fetchText(url, { cacheTtlMs: 6 * 60 * 60 * 1000 });
      const parsed = parser.parse(xml) as { feed?: { entry?: JStageEntry | JStageEntry[] } };
      for (const entry of asArray(parsed.feed?.entry)) {
        const title = pickLang(entry.article_title);
        const year = Number(textOf(entry.pubyear));
        if (!title || !Number.isFinite(year) || year < minYear) continue;
        const doi = textOf(entry["prism:doi"]);
        const url = linkOf(entry);
        if (!url) continue;
        items.push({
          source: "jstage",
          type: "article",
          title,
          lang: "ja",
          authors: authorsOf(entry),
          publishedAt: `${year}-01-01`,
          venueName: pickLang(entry.material_title),
          doi,
          url,
        });
      }
    } catch (error) {
      console.warn(`[jstage] query failed (${keyword}):`, (error as Error).message);
    }
  }
  console.log(`[jstage] ${items.length} articles`);
  return items;
}
