import test from "node:test";
import assert from "node:assert/strict";
import { assess } from "../pipeline/relevance.ts";
import { loadConfig } from "../pipeline/lib/config.ts";
import { makeItem } from "./helpers.ts";

const config = loadConfig();

test("accepts an English article on the Japanese empire", () => {
  const verdict = assess(
    makeItem({
      lang: "en",
      title: "The Making of the Japanese Empire: Railways and Colonial Rule",
      abstract: "This article examines railway building in colonial Korea and Manchuria.",
    }),
    config.topics,
  );
  assert.equal(verdict.relevant, true);
  assert.equal(verdict.confidence, 1);
});

test("rejects English noise about Japanese encephalitis", () => {
  const verdict = assess(
    makeItem({
      lang: "en",
      title: "Japanese encephalitis vaccination in rural children",
      abstract: "A clinical trial of vaccine schedules.",
    }),
    config.topics,
  );
  assert.equal(verdict.relevant, false);
});

test("accepts a Chinese article on Meiji state building", () => {
  const verdict = assess(
    makeItem({
      lang: "zh",
      title: "明治维新与日本近代国家的形成",
      abstract: "本文讨论明治时期国民国家建构与地方治理。",
    }),
    config.topics,
  );
  assert.equal(verdict.relevant, true);
  assert.equal(verdict.period, "meiji");
});

test("rejects Chinese financial news noise", () => {
  const verdict = assess(
    makeItem({
      lang: "zh",
      title: "日本央行调整货币政策",
      abstract: "日本央行宣布加息，日本股市震荡。",
    }),
    config.topics,
  );
  assert.equal(verdict.relevant, false);
});

test("accepts Japanese and Korean titles", () => {
  const ja = assess(
    makeItem({ lang: "ja", title: "明治維新における国民国家の形成" }),
    config.topics,
  );
  assert.equal(ja.relevant, true);

  const ko = assess(
    makeItem({ lang: "ko", title: "근대 일본의 식민지 인식과 동아시아 질서" }),
    config.topics,
  );
  assert.equal(ko.relevant, true);
});
