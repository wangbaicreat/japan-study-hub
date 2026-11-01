import { loadConfig } from "./lib/config.ts";
import type { AppConfig, Item, Lang, RawItem } from "./lib/types.ts";
import { dedupe } from "./dedupe.ts";
import { normalize } from "./normalize.ts";
import { fetchOpenAlex } from "./sources/openalex.ts";
import type { OpenAlexQuery } from "./sources/openalex.ts";
import { fetchCrossref } from "./sources/crossref.ts";
import { fetchJStage } from "./sources/jstage.ts";
import { fetchKci } from "./sources/kci.ts";
import { fetchCinii } from "./sources/cinii.ts";
import { fetchNdl } from "./sources/ndl.ts";
import { applyJstor, loadJstorIndex, syncJstor } from "./sources/jstor.ts";
import { fetchManual } from "./sources/manual.ts";
import { fetchChineseJournals } from "./sources/cnjournals.ts";

const LANGS: Lang[] = ["zh", "en", "ja", "ko"];

function sourceOptions(config: AppConfig, key: string): Record<string, unknown> {
  return config.sources[key] ?? {};
}

function numberOption(options: Record<string, unknown>, key: string, fallback: number): number {
  const value = options[key];
  return typeof value === "number" ? value : fallback;
}

export async function collectAll(options: { skipNetwork?: boolean } = {}): Promise<Item[]> {
  const config = loadConfig();
  const raw: RawItem[] = [];

  if (!options.skipNetwork) {
    const jstorOptions = sourceOptions(config, "jstor");
    if (jstorOptions.enabled !== false) {
      try {
        await syncJstor(numberOption(jstorOptions, "kbart_max_age_days", 7));
      } catch (error) {
        console.warn("[jstor] KBART sync failed:", (error as Error).message);
      }
    }

    const openalexOptions = sourceOptions(config, "openalex");
    if (openalexOptions.enabled !== false) {
      const queries: OpenAlexQuery[] = [];
      for (const lang of LANGS) {
        for (const search of config.topics.languages[lang].queries.slice(0, 3)) {
          queries.push({ lang, search });
        }
      }
      // Chinese-language journals are indexed spottily and often mistagged, so
      // run a few searches without the language filter and keep the zh hits.
      queries.push(
        { lang: "zh", search: "日本近代史", sort: "" },
        { lang: "zh", search: "明治维新", sort: "" },
        { lang: "zh", search: "近代中日关系", sort: "" },
        { lang: "zh", search: "日本帝国主义", sort: "" },
        { lang: "ko", search: "일본 근대", anyLanguage: true },
      );
      queries.push({ lang: "en", search: "modern Japan history", type: "book" });
      raw.push(
        ...(await fetchOpenAlex({
          lookbackDays: numberOption(openalexOptions, "lookback_days", 150),
          perPage: numberOption(openalexOptions, "per_page", 50),
          maxRequests: numberOption(openalexOptions, "max_requests", 40),
          queries,
        })),
      );
    }

    const crossrefOptions = sourceOptions(config, "crossref");
    if (crossrefOptions.enabled !== false) {
      const queries = Array.isArray(crossrefOptions.queries)
        ? (crossrefOptions.queries as string[])
        : ["modern Japan history"];
      raw.push(
        ...(await fetchCrossref({
          lookbackDays: numberOption(crossrefOptions, "lookback_days", 240),
          rows: numberOption(crossrefOptions, "rows", 40),
          queries,
        })),
      );
    }

    const jstageOptions = sourceOptions(config, "jstage");
    if (jstageOptions.enabled !== false) {
      const keywords = config.topics.languages.ja.queries.slice(
        0,
        numberOption(jstageOptions, "max_keywords", 10),
      );
      raw.push(
        ...(await fetchJStage({
          keywords,
          count: numberOption(jstageOptions, "count", 50),
        })),
      );
    }

    const kciOptions = sourceOptions(config, "kci");
    if (kciOptions.enabled !== false) {
      raw.push(...(await fetchKci({ lookbackDays: numberOption(kciOptions, "lookback_days", 180) })));
    }

    const ciniiOptions = sourceOptions(config, "cinii");
    if (ciniiOptions.enabled !== false) {
      raw.push(
        ...(await fetchCinii({
          queries: config.topics.languages.ja.queries.slice(0, 3),
          lookbackDays: numberOption(ciniiOptions, "lookback_days", 180),
        })),
      );
    }

    const cnOptions = sourceOptions(config, "cnjournals");
    if (cnOptions.enabled === true) {
      const journals = Array.isArray(cnOptions.journals)
        ? (cnOptions.journals as { name: string; home: string; enabled?: boolean }[])
        : [];
      raw.push(
        ...(await fetchChineseJournals({
          journals,
          maxArticlesPerJournal: numberOption(cnOptions, "max_articles_per_journal", 12),
        })),
      );
    }

    const ndlOptions = sourceOptions(config, "ndl");
    if (ndlOptions.enabled === true) {
      raw.push(...(await fetchNdl({ queries: config.topics.languages.ja.queries.slice(0, 2) })));
    }
  }

  raw.push(...fetchManual());

  const normalized = raw
    .map((entry) => normalize(entry))
    .filter((item): item is Item => Boolean(item));
  const unique = dedupe(normalized);

  const index = loadJstorIndex();
  if (index) {
    const matched = applyJstor(unique, index);
    console.log(`[jstor] ${matched} items resolved to JSTOR links`);
  }

  console.log(`[collect] ${raw.length} raw -> ${unique.length} unique items`);
  return unique;
}
