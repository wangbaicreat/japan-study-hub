import fs from "node:fs";
import path from "node:path";
import { fetchText } from "../lib/http.ts";
import { paths } from "../lib/paths.ts";
import type { Item, RawItem } from "../lib/types.ts";

/**
 * JSTOR has no public search API. What it does publish is:
 *   - KBART title lists for every journal and book on the platform
 *   - an OpenURL resolver (https://www.jstor.org/openurl)
 * So we keep a local index of "what is on JSTOR", match incoming metadata
 * against it by ISSN/ISBN, and link through OpenURL. Institutions with a
 * JSTOR Metasearch License can additionally switch on the SRU gateway.
 */

const KBART = {
  journals:
    "https://www.jstor.org/kbart/collections/all-archive-titles?contentType=journals",
  books: "https://www.jstor.org/kbart/collections/all-book-titles",
};

export type JstorJournal = { title: string; firstYear: number; lastYear: number };
export type JstorBook = { title: string; publisher?: string };

export type JstorIndex = {
  journals: Map<string, JstorJournal>;
  journalTitles: Map<string, JstorJournal>;
  books: Map<string, JstorBook>;
  bookTitles: Map<string, JstorBook>;
  syncedAt?: string;
};

function titleKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function fileFor(kind: "journals" | "books"): string {
  return path.join(paths.jstor, `${kind}.tsv`);
}

function metaFile(): string {
  return path.join(paths.jstor, "meta.json");
}

function isFresh(maxAgeDays: number): boolean {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile(), "utf8")) as { syncedAt: string };
    const age = Date.now() - new Date(meta.syncedAt).getTime();
    return age < maxAgeDays * 86_400_000;
  } catch {
    return false;
  }
}

function normalizeIssn(value: string): string | undefined {
  const cleaned = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return cleaned.length === 8 ? cleaned : undefined;
}

function normalizeIsbn(value: string): string | undefined {
  const cleaned = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return cleaned.length === 10 || cleaned.length === 13 ? cleaned : undefined;
}

function yearOf(value: string): number {
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function parseKbart(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = (lines.shift() ?? "").split("\t").map((cell) => cell.trim().toLowerCase());
  const rows = lines.map((line) => line.split("\t"));
  return { header, rows };
}

function column(header: string[], ...names: string[]): number {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

export function buildIndex(
  journalText: string,
  bookText: string,
): JstorIndex {
  const journals = new Map<string, JstorJournal>();
  const journalTitles = new Map<string, JstorJournal>();
  const books = new Map<string, JstorBook>();
  const bookTitles = new Map<string, JstorBook>();

  {
    const { header, rows } = parseKbart(journalText);
    const titleCol = column(header, "publication_title");
    const printCol = column(header, "print_identifier");
    const onlineCol = column(header, "online_identifier");
    const firstCol = column(header, "date_first_issue_online");
    const lastCol = column(header, "date_last_issue_online");
    if (titleCol >= 0) {
      for (const row of rows) {
        const title = row[titleCol]?.trim();
        if (!title) continue;
        const firstYear = firstCol >= 0 ? yearOf(row[firstCol] ?? "") : 0;
        const lastYear = lastCol >= 0 ? yearOf(row[lastCol] ?? "") : 9999;
        const entry = { title, firstYear, lastYear: lastYear || 9999 };
        journalTitles.set(titleKey(title), entry);
        for (const col of [printCol, onlineCol]) {
          if (col < 0) continue;
          const issn = normalizeIssn(row[col] ?? "");
          if (issn) journals.set(issn, entry);
        }
      }
    }
  }

  {
    const { header, rows } = parseKbart(bookText);
    const titleCol = column(header, "publication_title", "title");
    const isbnCols = [column(header, "isbn"), column(header, "print_identifier"), column(header, "online_identifier")];
    const publisherCol = column(header, "publisher_name", "publisher");
    if (titleCol >= 0) {
      for (const row of rows) {
        const title = row[titleCol]?.trim();
        if (!title) continue;
        const publisher = publisherCol >= 0 ? row[publisherCol]?.trim() : undefined;
        const entry = { title, publisher };
        bookTitles.set(titleKey(title), entry);
        for (const col of isbnCols) {
          if (col < 0) continue;
          const isbn = normalizeIsbn(row[col] ?? "");
          if (isbn) books.set(isbn, entry);
        }
      }
    }
  }

  return { journals, journalTitles, books, bookTitles, syncedAt: new Date().toISOString() };
}

export async function syncJstor(maxAgeDays = 7, force = false): Promise<void> {
  fs.mkdirSync(paths.jstor, { recursive: true });
  if (!force && isFresh(maxAgeDays) && fs.existsSync(fileFor("journals")) && fs.existsSync(fileFor("books"))) {
    return;
  }
  console.log("[jstor] downloading KBART title lists (this takes a moment)");
  const [journals, books] = await Promise.all([
    fetchText(KBART.journals, { timeoutMs: 120_000 }),
    fetchText(KBART.books, { timeoutMs: 180_000 }),
  ]);
  fs.writeFileSync(fileFor("journals"), journals);
  fs.writeFileSync(fileFor("books"), books);
  fs.writeFileSync(metaFile(), JSON.stringify({ syncedAt: new Date().toISOString() }, null, 2));
  console.log(`[jstor] journals=${journals.length} bytes books=${books.length} bytes`);
}

let indexCache: JstorIndex | undefined;

export function loadJstorIndex(): JstorIndex | undefined {
  if (indexCache) return indexCache;
  try {
    const journals = fs.readFileSync(fileFor("journals"), "utf8");
    const books = fs.readFileSync(fileFor("books"), "utf8");
    indexCache = buildIndex(journals, books);
    console.log(
      `[jstor] index: ${indexCache.journals.size} ISSNs, ${indexCache.books.size} ISBNs`,
    );
    return indexCache;
  } catch {
    console.warn("[jstor] KBART index unavailable; skipping JSTOR matching");
    return undefined;
  }
}

export function jstorUrlFor(item: Item, index: JstorIndex): string | undefined {
  const isbn = item.ids.isbn;
  const issn = item.venue?.issn;
  const year = Number((item.publishedAt ?? "").slice(0, 4));

  if (isbn) {
    const book = index.books.get(normalizeIsbn(isbn) ?? "");
    if (book) return `https://www.jstor.org/openurl?isbn=${encodeURIComponent(isbn)}`;
  }
  if (item.type === "book" && item.title) {
    if (index.bookTitles.has(titleKey(item.title))) {
      const params = new URLSearchParams({ title: item.title });
      if (isbn) params.set("isbn", isbn);
      return `https://www.jstor.org/openurl?${params.toString()}`;
    }
  }
  if (issn || item.venue?.name) {
    const journal =
      (issn ? index.journals.get(normalizeIssn(issn) ?? "") : undefined) ??
      (item.venue?.name ? index.journalTitles.get(titleKey(item.venue.name)) : undefined);
    if (journal && year >= journal.firstYear && year <= journal.lastYear) {
      const params = new URLSearchParams();
      if (issn) params.set("issn", issn);
      if (year) params.set("date", String(year));
      if (item.volume) params.set("volume", item.volume);
      if (item.issue) params.set("issue", item.issue);
      if (item.firstPage) params.set("spage", item.firstPage);
      if (!issn) params.set("title", journal.title);
      return `https://www.jstor.org/openurl?${params.toString()}`;
    }
  }
  return undefined;
}

export function applyJstor(items: Item[], index: JstorIndex): number {
  let matched = 0;
  for (const item of items) {
    const url = jstorUrlFor(item, index);
    if (!url) continue;
    item.jstor = { onJstor: true, url };
    if (item.type === "book") item.ids.url = url;
    matched++;
  }
  return matched;
}

/**
 * Experimental: only for institutions holding a JSTOR Metasearch License.
 * Disabled unless JSTOR_SRU_URL is configured.
 */
export async function fetchJstorSru(query: string): Promise<RawItem[]> {
  const endpoint = process.env.JSTOR_SRU_URL;
  if (!endpoint) return [];
  const url = `${endpoint}?operation=searchRetrieve&version=1.1&query=${encodeURIComponent(query)}&maximumRecords=50`;
  const xml = await fetchText(url, { cacheTtlMs: 0 });
  console.warn("[jstor] SRU response received, parsing is best-effort");
  const records: RawItem[] = [];
  const blocks = xml.split(/<recordData[\s>]/i).slice(1);
  for (const block of blocks) {
    const title = block.match(/<dc:title>([\s\S]*?)<\/dc:title>/i)?.[1];
    const identifier = block.match(/<dc:identifier>([\s\S]*?)<\/dc:identifier>/i)?.[1];
    const date = block.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1];
    if (!title || !identifier) continue;
    records.push({
      source: "jstor",
      type: "article",
      title: title.replace(/<[^>]+>/g, "").trim(),
      publishedAt: date?.slice(0, 10),
      url: identifier.trim(),
    });
  }
  return records;
}
