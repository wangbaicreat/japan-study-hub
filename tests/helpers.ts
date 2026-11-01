import type { Item } from "../pipeline/lib/types.ts";

export function makeItem(partial: Partial<Item> & Pick<Item, "title" | "lang">): Item {
  const publishedAt = partial.publishedAt ?? new Date().toISOString().slice(0, 10);
  return {
    id: partial.id ?? `id-${partial.title}`,
    type: partial.type ?? "article",
    lang: partial.lang,
    title: partial.title,
    titleZh: partial.titleZh,
    introZh: partial.introZh,
    abstract: partial.abstract,
    authors: partial.authors ?? [{ name: "Test Author" }],
    publishedAt,
    indexedAt: partial.indexedAt,
    venue: partial.venue,
    ids: partial.ids ?? { url: "https://example.org/item" },
    jstor: partial.jstor,
    citationCount: partial.citationCount,
    fwci: partial.fwci,
    volume: partial.volume,
    issue: partial.issue,
    firstPage: partial.firstPage,
    sources: partial.sources ?? ["openalex"],
    score: partial.score,
    ai: partial.ai,
  };
}
