import type { Item } from "./lib/types.ts";
import { normalizeTitle } from "./lib/util.ts";

function fingerprint(item: Item): string {
  const author = (item.authors[0]?.name ?? "").toLowerCase();
  return `${normalizeTitle(item.title)}|${author}|${item.publishedAt.slice(0, 4)}`;
}

function merge(target: Item, incoming: Item): Item {
  return {
    ...target,
    // Prefer the record that carries an abstract, then the longer one.
    abstract: target.abstract ?? incoming.abstract,
    titleZh: target.titleZh ?? incoming.titleZh,
    introZh: target.introZh ?? incoming.introZh,
    citationCount: Math.max(target.citationCount ?? 0, incoming.citationCount ?? 0) || undefined,
    fwci: Math.max(target.fwci ?? 0, incoming.fwci ?? 0) || undefined,
    publishedAt:
      target.publishedAt <= incoming.publishedAt ? target.publishedAt : incoming.publishedAt,
    indexedAt: target.indexedAt ?? incoming.indexedAt,
    jstor: target.jstor ?? incoming.jstor,
    sources: [...new Set([...target.sources, ...incoming.sources])],
    ids: {
      doi: target.ids.doi ?? incoming.ids.doi,
      isbn: target.ids.isbn ?? incoming.ids.isbn,
      url: target.ids.url || incoming.ids.url,
    },
    venue: target.venue ?? incoming.venue,
  };
}

/** Merge duplicates by DOI, then ISBN, then a title/author/year fingerprint. */
export function dedupe(items: Item[]): Item[] {
  const byDoi = new Map<string, Item>();
  const byIsbn = new Map<string, Item>();
  const byTitle = new Map<string, Item>();
  const output: Item[] = [];

  for (const item of items) {
    const doi = item.ids.doi?.toLowerCase();
    const isbn = item.ids.isbn;
    const titleKey = fingerprint(item);

    const existing = (doi && byDoi.get(doi)) || (isbn && byIsbn.get(isbn)) || byTitle.get(titleKey);
    if (existing) {
      const merged = merge(existing, item);
      Object.assign(existing, merged);
      if (merged.ids.doi) byDoi.set(merged.ids.doi, existing);
      if (merged.ids.isbn) byIsbn.set(merged.ids.isbn, existing);
      byTitle.set(titleKey, existing);
      continue;
    }

    output.push(item);
    if (doi) byDoi.set(doi, item);
    if (isbn) byIsbn.set(isbn, item);
    byTitle.set(titleKey, item);
  }

  return output;
}
