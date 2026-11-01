import type { Item, Relevance, TopicsConfig } from "./lib/types.ts";

function containsAny(text: string, terms: string[]): boolean {
  const haystack = text.toLowerCase();
  return terms.some((term) => term && haystack.includes(term.toLowerCase()));
}

/**
 * Cheap, deterministic gate that runs before (and without) any LLM.
 *
 * Precision matters more than recall here: the digest is short, and one
 * off-topic item costs more than a missed one. So the Japan signal must be in
 * the title or the venue name ("Korean Journal of Japanese Studies"), while the
 * modern-period signal may come from the abstract.
 *
 * Term lists are matched against the union of all four languages: Korean
 * journals often publish English titles, and Chinese databases mix scripts.
 */
export function assess(item: Item, topics: TopicsConfig): Relevance {
  const bundles = Object.values(topics.languages);
  const japanTerms = bundles.flatMap((bundle) => bundle.japan);
  const modernTerms = bundles.flatMap((bundle) => bundle.modern);
  const excludeTerms = bundles.flatMap((bundle) => bundle.exclude);

  const title = item.title;
  const venue = item.venue?.name ?? "";
  const body = `${title} ${item.abstract ?? ""}`;

  if (topics.blocked_venues.some((blocked) => venue.toLowerCase().includes(blocked))) {
    return { relevant: false, confidence: 0, period: "unknown" };
  }
  if (containsAny(body, excludeTerms)) {
    return { relevant: false, confidence: 0, period: "unknown" };
  }

  const japanSignal = containsAny(title, japanTerms) || containsAny(venue, japanTerms);
  const modernInTitle = containsAny(title, modernTerms);
  const modernAnywhere = modernInTitle || containsAny(body, modernTerms);

  if (!japanSignal || !modernAnywhere) {
    return { relevant: false, confidence: 0, period: "unknown" };
  }
  // Chinese indexes are noisy enough that a passing abstract is not enough:
  // the title itself must signal the modern period.
  if (item.lang === "zh" && !modernInTitle) {
    return { relevant: false, confidence: 0, period: "unknown" };
  }

  return {
    relevant: true,
    confidence: modernInTitle ? 1 : 0.8,
    period: detectPeriod(body, topics),
  };
}

function detectPeriod(text: string, topics: TopicsConfig): string {
  for (const [period, terms] of Object.entries(topics.periods)) {
    if (containsAny(text, terms)) return period;
  }
  return "cross";
}
