import { fetchJson } from "../lib/http.ts";
import { env } from "../lib/config.ts";
import type { RawItem } from "../lib/types.ts";

const BASE = "https://api.openalex.org/works";

const SELECT = [
  "id",
  "doi",
  "display_name",
  "publication_date",
  "publication_year",
  "type",
  "language",
  "authorships",
  "primary_location",
  "cited_by_count",
  "fwci",
  "abstract_inverted_index",
  "created_date",
  "biblio",
  "primary_topic",
].join(",");

type OpenAlexWork = {
  id: string;
  doi?: string | null;
  display_name?: string;
  publication_date?: string;
  publication_year?: number;
  type?: string;
  language?: string | null;
  authorships?: { author?: { display_name?: string; id?: string } }[];
  primary_location?: {
    source?: {
      display_name?: string;
      issn_l?: string;
      host_organization_name?: string;
      type?: string;
    } | null;
  } | null;
  cited_by_count?: number;
  fwci?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  created_date?: string;
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null };
  primary_topic?: { domain?: { id?: string; display_name?: string } } | null;
};

type OpenAlexResponse = {
  meta?: { count?: number };
  results?: OpenAlexWork[];
};

function keyParam(): string {
  const key = env("OPENALEX_KEY");
  return key ? `&api_key=${encodeURIComponent(key)}` : "";
}

/** Rebuild plain text from OpenAlex's inverted abstract index. */
export function reconstructAbstract(index?: Record<string, number[]> | null): string | undefined {
  if (!index) return undefined;
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) slots[position] = word;
  }
  const text = slots.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

function mapType(type?: string): RawItem["type"] {
  if (type === "book") return "book";
  if (type === "book-chapter") return "chapter";
  if (type === "review") return "review";
  return "article";
}

function stripDoi(doi?: string | null): string | undefined {
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase();
}

function toRaw(work: OpenAlexWork): RawItem | undefined {
  const title = (work.display_name ?? "").trim();
  if (!title) return undefined;
  // Keep the social-science / humanities half of OpenAlex; a "modern Japan"
  // query otherwise drags in geology, fisheries and materials science.
  const domain = work.primary_topic?.domain?.id;
  if (domain && domain !== "https://openalex.org/domains/2") return undefined;
  const doi = stripDoi(work.doi);
  const source = work.primary_location?.source ?? undefined;
  return {
    source: "openalex",
    type: mapType(work.type),
    title,
    lang: work.language ?? undefined,
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name ?? "")
      .filter(Boolean),
    publishedAt: work.publication_date,
    indexedAt: work.created_date ? work.created_date.slice(0, 10) : undefined,
    venueName: source?.display_name,
    publisher: source?.host_organization_name,
    issn: source?.issn_l ?? undefined,
    doi,
    url: doi ? `https://doi.org/${doi}` : work.id,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    citationCount: work.cited_by_count,
    fwci: work.fwci,
    volume: work.biblio?.volume ?? undefined,
    issue: work.biblio?.issue ?? undefined,
    firstPage: work.biblio?.first_page ?? undefined,
  };
}

async function query(params: {
  filter: string;
  search?: string;
  perPage: number;
  sort?: string;
}): Promise<OpenAlexWork[]> {
  const search = params.search ? `&search=${encodeURIComponent(params.search)}` : "";
  const sort = params.sort ? `&sort=${params.sort}` : "";
  const url =
    `${BASE}?filter=${params.filter}` +
    `&per-page=${params.perPage}${search}${sort}` +
    `&select=${SELECT}${keyParam()}`;
  const data = await fetchJson<OpenAlexResponse>(url, { cacheTtlMs: 6 * 60 * 60 * 1000 });
  return data.results ?? [];
}

export type OpenAlexQuery = {
  lang: string;
  search: string | null;
  type?: "article" | "book";
  /** Search all languages, then keep only records tagged `lang` (used for zh). */
  anyLanguage?: boolean;
  /** Defaults to newest-first; Chinese queries use relevance. */
  sort?: string;
};

export async function fetchOpenAlex(options: {
  lookbackDays: number;
  perPage: number;
  maxRequests: number;
  queries: OpenAlexQuery[];
}): Promise<RawItem[]> {
  const since = new Date(Date.now() - options.lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const items: RawItem[] = [];
  let requests = 0;

  for (const queryDef of options.queries) {
    if (requests >= options.maxRequests) break;
    const filters = [`from_publication_date:${since}`];
    if (queryDef.type === "book") {
      filters.push("type:book");
    } else {
      if (!queryDef.anyLanguage) filters.push(`language:${queryDef.lang}`);
      filters.push("type:article|review");
      // Books and chapters are fetched by the dedicated book query.
    }
    if (queryDef.search) {
      filters.push(`title_and_abstract.search:${queryDef.search}`);
    }
    try {
      requests++;
      const works = await query({
        filter: filters.join(","),
        perPage: options.perPage,
        sort: queryDef.sort ?? "publication_date:desc",
      });
      for (const work of works) {
        const raw = toRaw(work);
        if (!raw) continue;
        if (queryDef.anyLanguage && raw.lang !== queryDef.lang) continue;
        items.push(raw);
      }
    } catch (error) {
      console.warn(`[openalex] query failed (${queryDef.lang}):`, (error as Error).message);
    }
  }
  console.log(`[openalex] ${requests} requests -> ${items.length} records`);
  return items;
}
