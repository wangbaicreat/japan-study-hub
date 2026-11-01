import type { Item, Lang, RawItem } from "./lib/types.ts";
import { detectLang, normalizeTitle, sha1, stripHtml, toIsoDate } from "./lib/util.ts";

const LANGS: Lang[] = ["zh", "en", "ja", "ko"];

function asLang(value: string | undefined, fallbackText: string): Lang {
  const code = (value ?? "").toLowerCase().slice(0, 2);
  if (LANGS.includes(code as Lang)) return code as Lang;
  return detectLang(fallbackText);
}

export function itemId(raw: RawItem, lang: Lang, publishedAt: string): string {
  const doi = raw.doi?.toLowerCase();
  if (doi) return sha1(`doi:${doi}`);
  const isbn = raw.isbn?.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (isbn) return sha1(`isbn:${isbn}`);
  const author = (raw.authors?.[0] ?? "").toLowerCase();
  const year = publishedAt.slice(0, 4);
  return sha1(`title:${normalizeTitle(raw.title)}|${author}|${year}`);
}

export function normalize(raw: RawItem): Item | undefined {
  const title = stripHtml(raw.title ?? "");
  if (!title || title.length < 4) return undefined;
  const publishedAt = toIsoDate(raw.publishedAt) ?? new Date().toISOString().slice(0, 10);
  const lang = asLang(raw.lang, `${title} ${raw.abstract ?? ""}`);
  const doi = raw.doi?.toLowerCase();
  const isbn = raw.isbn?.replace(/[^0-9Xx]/g, "").toUpperCase() || undefined;
  const url = raw.url || (doi ? `https://doi.org/${doi}` : "");

  return {
    id: itemId(raw, lang, publishedAt),
    type: raw.type,
    lang,
    title,
    abstract: raw.abstract ? stripHtml(raw.abstract) : undefined,
    authors: (raw.authors ?? []).filter(Boolean).map((name) => ({ name })),
    publishedAt,
    indexedAt: toIsoDate(raw.indexedAt),
    venue: raw.venueName
      ? { name: raw.venueName, publisher: raw.publisher, issn: raw.issn }
      : raw.publisher
        ? { name: raw.publisher, publisher: raw.publisher }
        : undefined,
    ids: { doi, isbn, url },
    citationCount: raw.citationCount,
    fwci: raw.fwci,
    volume: raw.volume,
    issue: raw.issue,
    firstPage: raw.firstPage,
    sources: [raw.source],
  };
}
