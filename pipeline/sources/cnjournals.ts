import fs from "node:fs";
import path from "node:path";
import { fetchText } from "../lib/http.ts";
import { paths } from "../lib/paths.ts";
import { stripHtml } from "../lib/util.ts";
import type { RawItem } from "../lib/types.ts";

/**
 * Chinese academic journals are absent from OpenAlex/Crossref and CNKI has no
 * public API, so we read the table of contents of a few journals directly.
 *
 * Supported template: the "boyuan" platform used by CASS journals
 * (rbxk.ajcass.com and friends), which renders the current issue on the home
 * page and exposes 内容摘要 / 作者 / 时间 on each article page.
 */

export type ChineseJournal = {
  name: string;
  home: string;
  enabled?: boolean;
};

type SeenMap = Record<string, string>;

function seenFile(): string {
  return path.join(paths.cache, "cnjournals-seen.json");
}

function loadSeen(): SeenMap {
  try {
    return JSON.parse(fs.readFileSync(seenFile(), "utf8")) as SeenMap;
  } catch {
    return {};
  }
}

function saveSeen(seen: SeenMap): void {
  const cutoff = Date.now() - 180 * 86_400_000;
  const pruned: SeenMap = {};
  for (const [url, iso] of Object.entries(seen)) {
    if (new Date(iso).getTime() >= cutoff) pruned[url] = iso;
  }
  fs.mkdirSync(path.dirname(seenFile()), { recursive: true });
  fs.writeFileSync(seenFile(), JSON.stringify(pruned, null, 2));
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function clean(value: string): string {
  return decode(stripHtml(value)).replace(/\s+/g, " ").trim();
}

function match(html: string, pattern: RegExp): string | undefined {
  const found = html.match(pattern);
  return found?.[1] ? clean(found[1]) : undefined;
}

type ArticlePage = {
  title?: string;
  authors: string[];
  abstract?: string;
  publishedAt?: string;
  keywords?: string;
};

export function parseArticle(html: string): ArticlePage {
  const title =
    match(html, /class="erji_content_t"[^>]*>([\s\S]*?)<\/div>/i) ??
    match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const authorsRaw =
    match(html, /作者：([\s\S]*?)&nbsp;/i) ??
    match(html, /作者：<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  const authors = (authorsRaw ?? "")
    .split(/[\s,，、;；]+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name.length < 30);

  const abstract =
    match(html, /内容摘要：<\/strong><\/span><span>([\s\S]*?)<\/span>/i) ??
    match(html, /摘要：<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);

  const dateMatch =
    html.match(/时间：\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/) ??
    html.match(/(\d{4})\.\((\d{1,2})\)/);
  const publishedAt = dateMatch
    ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-01`
    : undefined;

  const keywords = match(html, /关键词：<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);

  return { title, authors, abstract, publishedAt, keywords };
}

export function extractArticleLinks(html: string): string[] {
  const links = new Set<string>();
  const pattern = /href="(\/Magazine\/Show\?id=\d+)"/gi;
  for (const found of html.matchAll(pattern)) {
    if (found[1]) links.add(found[1]);
  }
  return [...links];
}

export async function fetchChineseJournals(options: {
  journals: ChineseJournal[];
  maxArticlesPerJournal: number;
}): Promise<RawItem[]> {
  const seen = loadSeen();
  const items: RawItem[] = [];

  for (const journal of options.journals) {
    if (journal.enabled === false) continue;
    const base = new URL(journal.home);
    try {
      const home = await fetchText(journal.home, { cacheTtlMs: 60 * 60 * 1000 });
      const links = extractArticleLinks(home).slice(0, options.maxArticlesPerJournal);
      let fetched = 0;

      for (const link of links) {
        const url = new URL(link, base).toString();
        if (seen[url]) continue;
        try {
          const page = await fetchText(url, { cacheTtlMs: 0 });
          const parsed = parseArticle(page);
          seen[url] = new Date().toISOString();
          fetched++;
          if (!parsed.title) continue;
          items.push({
            source: "cnjournal",
            type: "article",
            lang: "zh",
            title: parsed.title,
            authors: parsed.authors,
            publishedAt: parsed.publishedAt,
            venueName: journal.name,
            url,
            abstract: parsed.abstract,
          });
        } catch (error) {
          console.warn(`[cnjournals] ${journal.name} article failed:`, (error as Error).message);
        }
      }
      console.log(`[cnjournals] ${journal.name}: ${fetched} new articles`);
    } catch (error) {
      console.warn(`[cnjournals] ${journal.name} home failed:`, (error as Error).message);
    }
  }

  saveSeen(seen);
  return items;
}
