import { z } from "zod";

export const LangSchema = z.enum(["zh", "en", "ja", "ko"]);
export type Lang = z.infer<typeof LangSchema>;

export const ItemTypeSchema = z.enum(["article", "book", "chapter", "review"]);
export type ItemType = z.infer<typeof ItemTypeSchema>;

/** A record as returned by a source adapter, before normalisation. */
export type RawItem = {
  source: string;
  type: ItemType;
  title: string;
  lang?: string;
  authors?: string[];
  publishedAt?: string;
  indexedAt?: string;
  venueName?: string;
  publisher?: string;
  issn?: string;
  doi?: string;
  isbn?: string;
  url: string;
  abstract?: string;
  citationCount?: number;
  fwci?: number;
  volume?: string;
  issue?: string;
  firstPage?: string;
};

export const AuthorSchema = z.object({
  name: z.string(),
  openalexId: z.string().optional(),
});

export const VenueSchema = z.object({
  name: z.string(),
  publisher: z.string().optional(),
  issn: z.string().optional(),
  tier: z.number().int().min(1).max(3).optional(),
});

export const ItemSchema = z.object({
  id: z.string(),
  type: ItemTypeSchema,
  lang: LangSchema,
  title: z.string(),
  /** Chinese translation of the title, when an LLM is configured. */
  titleZh: z.string().optional(),
  /** Two or three Chinese sentences. The only prose shown in the digest. */
  introZh: z.string().optional(),
  abstract: z.string().optional(),
  authors: z.array(AuthorSchema).default([]),
  publishedAt: z.string(),
  indexedAt: z.string().optional(),
  venue: VenueSchema.optional(),
  ids: z.object({
    doi: z.string().optional(),
    isbn: z.string().optional(),
    url: z.string(),
  }),
  jstor: z
    .object({
      onJstor: z.boolean(),
      url: z.string().optional(),
    })
    .optional(),
  citationCount: z.number().optional(),
  fwci: z.number().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  firstPage: z.string().optional(),
  sources: z.array(z.string()).default([]),
  score: z
    .object({
      total: z.number(),
      components: z.record(z.number()),
    })
    .optional(),
  ai: z
    .object({
      relevant: z.boolean(),
      confidence: z.number(),
      period: z.string(),
      model: z.string(),
      at: z.string(),
    })
    .optional(),
});

export type Item = z.infer<typeof ItemSchema>;

export const DigestSchema = z.object({
  date: z.string(),
  generatedAt: z.string(),
  title: z.string(),
  sections: z.object({
    papers: z.array(ItemSchema),
    books: z.array(ItemSchema),
  }),
  stats: z.object({
    fetched: z.number(),
    deduped: z.number(),
    relevant: z.number(),
    byLang: z.record(z.number()),
    bySource: z.record(z.number()),
    llmCalls: z.number(),
    costUsd: z.number(),
  }),
  notices: z.array(z.string()).default([]),
});

export type Digest = z.infer<typeof DigestSchema>;

export type Relevance = {
  relevant: boolean;
  confidence: number;
  period: string;
};

export type AppConfig = {
  topics: TopicsConfig;
  venues: VenuesConfig;
  weights: WeightsConfig;
  sources: SourcesConfig;
};

export type TopicsConfig = {
  blocked_venues: string[];
  languages: Record<
    Lang,
    {
      label: string;
      japan: string[];
      modern: string[];
      exclude: string[];
      queries: string[];
    }
  >;
  periods: Record<string, string[]>;
};

export type VenuesConfig = {
  journals: { tier1: string[]; tier2: string[] };
  publishers: { tier1: string[]; tier2: string[] };
};

export type WeightsConfig = {
  score: Record<string, number>;
  recency: { half_life_days: number };
  selection: {
    max_papers: number;
    max_books: number;
    max_per_venue: number;
    max_per_language: number;
    language_floor: Record<string, number>;
    backfill_days: number;
  };
};

export type SourcesConfig = Record<string, Record<string, unknown> & { enabled?: boolean }>;
