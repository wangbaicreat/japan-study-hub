import test from "node:test";
import assert from "node:assert/strict";
import { dedupe } from "../pipeline/dedupe.ts";
import { makeItem } from "./helpers.ts";

test("merges records that share a DOI and unions their sources", () => {
  const a = makeItem({
    lang: "en",
    title: "Empire and Railways",
    ids: { doi: "10.1234/ABC", url: "https://doi.org/10.1234/abc" },
    sources: ["openalex"],
  });
  const b = makeItem({
    lang: "en",
    title: "Empire and Railways",
    ids: { doi: "10.1234/abc", url: "https://doi.org/10.1234/abc" },
    sources: ["crossref"],
    abstract: "An abstract that only one source has.",
  });

  const result = dedupe([a, b]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.sources.sort(), ["crossref", "openalex"]);
  assert.match(result[0]?.abstract ?? "", /only one source/);
});

test("merges records with the same title, author and year but no DOI", () => {
  const a = makeItem({ lang: "ja", title: "明治維新の研究", publishedAt: "2025-03-01" });
  const b = makeItem({ lang: "ja", title: "明治維新の研究", publishedAt: "2025-09-01" });
  const result = dedupe([a, b]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.publishedAt, "2025-03-01");
});

test("keeps genuinely different works apart", () => {
  const a = makeItem({ lang: "en", title: "Meiji Constitution", ids: { doi: "10.1/a", url: "https://doi.org/10.1/a" } });
  const b = makeItem({ lang: "en", title: "Meiji Constitution", ids: { doi: "10.1/b", url: "https://doi.org/10.1/b" }, authors: [{ name: "Other" }] });
  const result = dedupe([a, b]);
  assert.equal(result.length, 2);
});
