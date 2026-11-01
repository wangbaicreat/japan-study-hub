import test from "node:test";
import assert from "node:assert/strict";
import { scoreItem, venueTier } from "../pipeline/score.ts";
import { loadConfig } from "../pipeline/lib/config.ts";
import { makeItem } from "./helpers.ts";

const config = loadConfig();

test("ranks a tier-1 journal above an unlisted journal", () => {
  const strong = makeItem({
    lang: "en",
    title: "Empire and memory",
    venue: { name: "Journal of Japanese Studies" },
    publishedAt: "2026-10-01",
  });
  const weak = makeItem({
    lang: "en",
    title: "Empire and memory",
    venue: { name: "Proceedings of Nowhere" },
    publishedAt: "2026-10-01",
  });
  assert.equal(venueTier(strong, config), 1);
  assert.equal(venueTier(weak, config), 3);
  assert.ok(scoreItem(strong, config, 1).total > scoreItem(weak, config, 1).total);
});

test("prefers recent work over older work with the same venue", () => {
  const fresh = makeItem({
    lang: "en",
    title: "New work",
    venue: { name: "Journal of Japanese Studies" },
    publishedAt: new Date().toISOString().slice(0, 10),
  });
  const old = makeItem({
    lang: "en",
    title: "Old work",
    venue: { name: "Journal of Japanese Studies" },
    publishedAt: "2023-01-01",
  });
  assert.ok(scoreItem(fresh, config, 1).total > scoreItem(old, config, 1).total);
});

test("gives a JSTOR match a positive bump", () => {
  const base = makeItem({
    lang: "en",
    title: "Colonial Taiwan",
    venue: { name: "Journal of Japanese Studies" },
    publishedAt: "2026-10-01",
  });
  const withJstor = { ...base, jstor: { onJstor: true, url: "https://www.jstor.org/openurl?issn=1" } };
  assert.ok(scoreItem(withJstor, config, 1).total > scoreItem(base, config, 1).total);
});
