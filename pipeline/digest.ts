import type { AppConfig, Digest, Item, Lang } from "./lib/types.ts";
import { addDays } from "./lib/store.ts";
import { assess } from "./relevance.ts";
import { scoreItem } from "./score.ts";
import { summarize } from "./summarize.ts";
import type { LlmStats } from "./summarize.ts";

const LANGS: Lang[] = ["en", "ja", "ko", "zh"];
const LANG_LABEL: Record<Lang, string> = { zh: "中文", en: "英文", ja: "日文", ko: "韩文" };

export type BuildOptions = {
  date: string;
  items: Item[];
  config: AppConfig;
  seen: Set<string>;
  ignoreSeen?: boolean;
  useLlm?: boolean;
};

type Scored = { item: Item; confidence: number };

function selectWithin(
  pool: Scored[],
  max: number,
  maxPerVenue: number,
  maxPerLanguage: number,
): Item[] {
  const chosen: Item[] = [];
  const venueCount = new Map<string, number>();
  const langCount = new Map<string, number>();

  for (const { item } of pool) {
    if (chosen.length >= max) break;
    const venue = (item.venue?.name ?? "unknown").toLowerCase();
    const venueTotal = venueCount.get(venue) ?? 0;
    if (venueTotal >= maxPerVenue) continue;
    const langTotal = langCount.get(item.lang) ?? 0;
    if (langTotal >= maxPerLanguage) continue;
    chosen.push(item);
    venueCount.set(venue, venueTotal + 1);
    langCount.set(item.lang, langTotal + 1);
  }
  return chosen;
}

export async function buildDigest(options: BuildOptions): Promise<Digest> {
  const { date, items, config, seen } = options;
  const windowStart = addDays(date, -400);

  const scored: Scored[] = [];
  let deduped = 0;
  let relevant = 0;

  for (const item of items) {
    if (item.publishedAt < windowStart || item.publishedAt > addDays(date, 7)) continue;
    deduped++;
    const verdict = assess(item, config.topics);
    item.ai = {
      relevant: verdict.relevant,
      confidence: verdict.confidence,
      period: verdict.period,
      model: "rules",
      at: new Date().toISOString(),
    };
    if (!verdict.relevant) continue;
    relevant++;
    const score = scoreItem(item, config, verdict.confidence);
    item.score = score;
    scored.push({ item, confidence: verdict.confidence });
  }

  scored.sort((a, b) => (b.item.score?.total ?? 0) - (a.item.score?.total ?? 0));

  const fresh = scored.filter(({ item }) => options.ignoreSeen || !seen.has(item.id));
  const papers = fresh.filter(({ item }) => item.type === "article" || item.type === "review");
  const books = fresh.filter(({ item }) => item.type === "book" || item.type === "chapter");

  const limits = config.weights.selection;
  const selectedBooks = selectWithin(books, limits.max_books, limits.max_per_venue, limits.max_per_language);
  const selectedPapers = selectWithin(papers, limits.max_papers, limits.max_per_venue, limits.max_per_language);

  const notices: string[] = [];
  const chosen = [...selectedPapers, ...selectedBooks];

  for (const lang of LANGS) {
    const floor = limits.language_floor[lang] ?? 0;
    if (floor <= 0) continue;
    let count = chosen.filter((item) => item.lang === lang).length;
    if (count >= floor) continue;

    const spare = fresh
      .filter(({ item }) => item.lang === lang && !chosen.includes(item))
      .sort((a, b) => (b.item.score?.total ?? 0) - (a.item.score?.total ?? 0));

    for (const { item } of spare) {
      if (count >= floor) break;
      if (chosen.length >= limits.max_papers + limits.max_books + 3) break;
      chosen.push(item);
      count++;
      if (item.type === "book") selectedBooks.push(item);
      else selectedPapers.push(item);
    }

    if (count < floor) {
      notices.push(`今日暂无${LANG_LABEL[lang]}文献`);
    } else if (spare.length > 0) {
      const oldest = spare[0];
      if (oldest && oldest.item.publishedAt < addDays(date, -limits.backfill_days)) {
        notices.push(`${LANG_LABEL[lang]}今日无新增，以上为近期条目`);
      }
    }
  }

  const llmStats: LlmStats = { calls: 0, costUsd: 0 };
  if (options.useLlm) {
    await summarize([...selectedPapers, ...selectedBooks], llmStats);
  }

  const byLang: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const item of chosen) byLang[item.lang] = (byLang[item.lang] ?? 0) + 1;
  for (const item of items) {
    for (const source of item.sources) bySource[source] = (bySource[source] ?? 0) + 1;
  }

  const sortByScore = (list: Item[]) =>
    [...new Set(list)].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  return {
    date,
    generatedAt: new Date().toISOString(),
    title: "近代日本史研究日报",
    sections: {
      papers: sortByScore(selectedPapers),
      books: sortByScore(selectedBooks),
    },
    stats: {
      fetched: items.length,
      deduped,
      relevant,
      byLang,
      bySource,
      llmCalls: llmStats.calls,
      costUsd: Math.round(llmStats.costUsd * 10_000) / 10_000,
    },
    notices: [...new Set(notices)],
  };
}
