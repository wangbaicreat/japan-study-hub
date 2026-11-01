import type { AppConfig, Item, VenuesConfig } from "./lib/types.ts";
import { ageInDays, clamp } from "./lib/util.ts";

function matchTier(name: string | undefined, venues: VenuesConfig, kind: "journal" | "publisher"): number {
  if (!name) return 3;
  const haystack = name.toLowerCase();
  const list =
    kind === "journal"
      ? { tier1: venues.journals.tier1, tier2: venues.journals.tier2 }
      : { tier1: venues.publishers.tier1, tier2: venues.publishers.tier2 };
  if (list.tier1.some((candidate) => haystack.includes(candidate.toLowerCase()))) return 1;
  if (list.tier2.some((candidate) => haystack.includes(candidate.toLowerCase()))) return 2;
  return 3;
}

const TIER_VALUE: Record<number, number> = { 1: 1, 2: 0.7, 3: 0.4 };

export function venueTier(item: Item, config: AppConfig): number {
  if (item.type === "book" || item.type === "chapter") {
    const publisher = item.venue?.publisher ?? item.venue?.name;
    return matchTier(publisher, config.venues, "publisher");
  }
  return matchTier(item.venue?.name, config.venues, "journal");
}

export function scoreItem(
  item: Item,
  config: AppConfig,
  relevanceConfidence: number,
  now = new Date(),
): { total: number; components: Record<string, number> } {
  const weights = config.weights.score;
  const age = ageInDays(item.publishedAt, now);

  const tier = venueTier(item, config);
  const venue = TIER_VALUE[tier] ?? 0.4;

  const ageYears = Math.max(0.5, age / 365);
  const citationSpeed = (item.citationCount ?? 0) / ageYears;
  const citation = clamp(Math.log1p(citationSpeed) / Math.log1p(20));

  const recency = 0.5 ** (age / Math.max(1, config.weights.recency.half_life_days));
  const crossSource = clamp((item.sources.length - 1) / 2);
  const jstor = item.jstor?.onJstor ? 1 : 0;

  const components = {
    venue,
    citation,
    relevance: clamp(relevanceConfidence),
    recency,
    cross_source: crossSource,
    jstor,
  };

  let total = 0;
  for (const [key, value] of Object.entries(components)) {
    total += (weights[key] ?? 0) * value;
  }

  return { total: Math.round(total * 1000) / 1000, components };
}
