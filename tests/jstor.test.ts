import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex, jstorUrlFor } from "../pipeline/sources/jstor.ts";
import { makeItem } from "./helpers.ts";

const journals = [
  "publication_title\tprint_identifier\tonline_identifier\tdate_first_issue_online\tdate_last_issue_online",
  "Journal of Japanese Studies\t0095-6848\t1549-4721\t1974-01-01\t2020-12-31",
  "Monumenta Nipponica\t0027-0741\t\t1938-01-01\t2019-12-31",
].join("\n");

const books = [
  "publication_title\tisbn\tpublisher_name",
  "The Making of Modern Japan\t9780674009912\tHarvard University Press",
].join("\n");

const index = buildIndex(journals, books);

test("indexes journals by print and online ISSN", () => {
  assert.ok(index.journals.has("00956848"));
  assert.ok(index.journals.has("15494721"));
  assert.equal(index.journals.get("00956848")?.firstYear, 1974);
  assert.equal(index.journals.get("00956848")?.lastYear, 2020);
});

test("builds an OpenURL when the year is inside JSTOR coverage", () => {
  const item = makeItem({
    lang: "en",
    title: "Village life in interwar Japan",
    publishedAt: "2019-04-01",
    venue: { name: "Journal of Japanese Studies", issn: "0095-6848" },
    volume: "45",
    firstPage: "112",
  });
  const url = jstorUrlFor(item, index);
  assert.ok(url?.startsWith("https://www.jstor.org/openurl?"));
  assert.match(url ?? "", /issn=0095-6848/);
  assert.match(url ?? "", /spage=112/);
});

test("does not link past the moving wall", () => {
  const item = makeItem({
    lang: "en",
    title: "Village life in interwar Japan",
    publishedAt: "2023-04-01",
    venue: { name: "Journal of Japanese Studies", issn: "0095-6848" },
  });
  assert.equal(jstorUrlFor(item, index), undefined);
});

test("falls back to the journal title when the ISSN is missing", () => {
  const item = makeItem({
    lang: "en",
    title: "Village life in interwar Japan",
    publishedAt: "2018-04-01",
    venue: { name: "Monumenta Nipponica" },
  });
  const url = jstorUrlFor(item, index);
  assert.match(url ?? "", /title=Monumenta\+Nipponica/);
});

test("links books by ISBN", () => {
  const item = makeItem({
    lang: "en",
    title: "The Making of Modern Japan",
    type: "book",
    ids: { isbn: "9780674009912", url: "https://example.org/book" },
  });
  assert.match(jstorUrlFor(item, index) ?? "", /isbn=9780674009912/);
});
