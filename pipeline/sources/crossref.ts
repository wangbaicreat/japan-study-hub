import { fetchJson } from "../lib/http.ts";
import { stripHtml } from "../lib/util.ts";
import type { RawItem } from "../lib/types.ts";

const BASE = "https://api.crossref.org/works";

type CrossrefItem = {
  DOI: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  publisher?: string;
  type?: string;
  ISBN?: string[];
  issued?: { "date-parts"?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
  abstract?: string;
  "container-title"?: string[];
  ISSN?: string[];
};

type CrossrefResponse = { message?: { items?: CrossrefItem[] } };

function mapType(type?: string): RawItem["type"] {
  if (type === "book") return "book";
  if (type === "book-chapter" || type === "reference-entry") return "chapter";
  return "article";
}

function dateOf(item: CrossrefItem): string | undefined {
  const parts = item.issued?.["date-parts"]?.[0];
  if (!parts || !parts[0]) return undefined;
  const [year, month = 1, day = 1] = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toRaw(item: CrossrefItem): RawItem | undefined {
  const title = stripHtml(item.title?.[0] ?? "");
  if (!title) return undefined;
  const doi = item.DOI.toLowerCase();
  const firstPage = item.page?.split("-")[0];
  return {
    source: "crossref",
    type: mapType(item.type),
    title,
    authors: (item.author ?? [])
      .map((author) => author.name ?? [author.given, author.family].filter(Boolean).join(" "))
      .filter(Boolean),
    publishedAt: dateOf(item),
    venueName: item["container-title"]?.[0],
    publisher: item.publisher,
    issn: item.ISSN?.[0],
    doi,
    isbn: item.ISBN?.[0]?.replace(/-/g, ""),
    url: `https://doi.org/${doi}`,
    abstract: item.abstract ? stripHtml(item.abstract) : undefined,
    volume: item.volume,
    issue: item.issue,
    firstPage,
  };
}

export async function fetchCrossref(options: {
  lookbackDays: number;
  rows: number;
  queries: string[];
}): Promise<RawItem[]> {
  const since = new Date(Date.now() - options.lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const items: RawItem[] = [];
  for (const query of options.queries) {
    const params = new URLSearchParams({
      "query.bibliographic": query,
      filter: `from-pub-date:${since},type:book`,
      rows: String(options.rows),
      select: "DOI,title,author,publisher,issued,ISBN,type,volume,issue,page,abstract,container-title,ISSN",
    });
    try {
      const data = await fetchJson<CrossrefResponse>(`${BASE}?${params}`, {
        cacheTtlMs: 6 * 60 * 60 * 1000,
      });
      for (const entry of data.message?.items ?? []) {
        const raw = toRaw(entry);
        if (raw) items.push(raw);
      }
    } catch (error) {
      console.warn(`[crossref] query failed (${query}):`, (error as Error).message);
    }
  }
  console.log(`[crossref] ${items.length} books`);
  return items;
}
