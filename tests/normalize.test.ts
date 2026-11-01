import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../pipeline/normalize.ts";

test("builds a stable id from a DOI", () => {
  const a = normalize({
    source: "openalex",
    type: "article",
    title: "The Japanese Empire",
    doi: "10.1017/S1234567890",
    url: "https://doi.org/10.1017/s1234567890",
    publishedAt: "2025-01-01",
  });
  const b = normalize({
    source: "crossref",
    type: "article",
    title: "The Japanese Empire",
    doi: "10.1017/s1234567890",
    url: "https://doi.org/10.1017/s1234567890",
    publishedAt: "2025-01-01",
  });
  assert.equal(a?.id, b?.id);
});

test("detects language from the title when the source omits it", () => {
  const ja = normalize({
    source: "jstage",
    type: "article",
    title: "明治維新と国民国家",
    url: "https://example.org/ja",
    publishedAt: "2025-01-01",
  });
  assert.equal(ja?.lang, "ja");

  const ko = normalize({
    source: "kci",
    type: "article",
    title: "근대 일본의 식민지",
    url: "https://example.org/ko",
    publishedAt: "2025-01-01",
  });
  assert.equal(ko?.lang, "ko");
});

test("rejects empty titles", () => {
  const item = normalize({
    source: "openalex",
    type: "article",
    title: " ",
    url: "https://example.org",
  });
  assert.equal(item, undefined);
});
