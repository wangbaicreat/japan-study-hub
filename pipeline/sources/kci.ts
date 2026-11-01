import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/http.ts";
import { env } from "../lib/config.ts";
import type { RawItem } from "../lib/types.ts";

/**
 * Korea Citation Index Open API.
 * A free key is issued at https://openci.kci.go.kr; the exact gateway path is
 * documented in the guide that ships with the key, so KCI_API_URL can be
 * overridden if the default ever moves.
 */

const DEFAULT_ENDPOINT = "https://openapi.kci.go.kr/rest/articleInfo";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function pickText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return pickText(record["#text"]) ?? pickText(record.ja) ?? pickText(record.en);
  }
  return undefined;
}

type KciRecord = {
  articleInfo?: {
    "article-id"?: string;
    "article-title"?: unknown;
    abstract?: unknown;
    doi?: string;
    url?: string;
    "citation-count"?: unknown;
    "pub-year"?: unknown;
  };
  journalInfo?: { "journal-name"?: unknown; "pub-year"?: unknown };
  authorGroup?: unknown;
};

function toRaw(record: KciRecord): RawItem | undefined {
  const info = record.articleInfo;
  const title = pickText(info?.["article-title"]);
  if (!title) return undefined;
  const doi = pickText(info?.doi)?.toLowerCase();
  const url = pickText(info?.url) ?? (doi ? `https://doi.org/${doi}` : undefined);
  if (!url) return undefined;
  const year = pickText(info?.["pub-year"]) ?? pickText(record.journalInfo?.["pub-year"]);
  return {
    source: "kci",
    type: "article",
    title,
    lang: "ko",
    publishedAt: year ? `${year.slice(0, 4)}-01-01` : undefined,
    venueName: pickText(record.journalInfo?.["journal-name"]),
    doi,
    url,
    abstract: pickText(info?.abstract),
    citationCount: Number(pickText(info?.["citation-count"])) || undefined,
  };
}

export async function fetchKci(options: { lookbackDays: number }): Promise<RawItem[]> {
  const key = env("KCI_API_KEY");
  if (!key) {
    console.log("[kci] KCI_API_KEY not set; skipping Korean Citation Index");
    return [];
  }
  const endpoint = env("KCI_API_URL") ?? DEFAULT_ENDPOINT;
  const now = new Date();
  const from = new Date(now.getTime() - options.lookbackDays * 86_400_000);
  const ymd = (date: Date) =>
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

  const params = new URLSearchParams({
    key,
    apiCode: "articleSearch",
    dateFrom: ymd(from),
    dateTo: ymd(now),
    displayCount: "100",
  });

  try {
    const text = await fetchText(`${endpoint}?${params.toString()}`, { cacheTtlMs: 0 });
    const records: KciRecord[] = [];
    if (text.trim().startsWith("{")) {
      const data = JSON.parse(text) as Record<string, unknown>;
      const output = (data.outputData ?? data) as Record<string, unknown>;
      records.push(...asArray(output.record as KciRecord | KciRecord[]));
    } else {
      const data = parser.parse(text) as Record<string, unknown>;
      const output = (data.outputData ?? data) as Record<string, unknown>;
      records.push(...asArray(output.record as KciRecord | KciRecord[]));
    }
    const items = records.map(toRaw).filter((item): item is RawItem => Boolean(item));
    console.log(`[kci] ${items.length} articles`);
    return items;
  } catch (error) {
    console.warn("[kci] request failed:", (error as Error).message);
    return [];
  }
}
