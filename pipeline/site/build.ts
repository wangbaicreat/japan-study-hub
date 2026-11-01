import fs from "node:fs";
import path from "node:path";
import { paths } from "../lib/paths.ts";
import { listDigests } from "../lib/store.ts";
import type { Digest } from "../lib/types.ts";
import { CSS } from "./styles.ts";
import {
  aboutPage,
  archivePage,
  booksPage,
  digestPage,
  feedXml,
} from "./templates.ts";

function write(relative: string, content: string): void {
  const file = path.join(paths.public, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function buildSite(digests?: Digest[]): { pages: number; latest?: string } {
  const all = (digests ?? listDigests()).sort((a, b) => a.date.localeCompare(b.date));
  fs.rmSync(paths.public, { recursive: true, force: true });
  fs.mkdirSync(paths.public, { recursive: true });

  write("assets/style.css", CSS);
  write("about.html", aboutPage());
  write("archive.html", archivePage(all));
  write("books.html", booksPage(all));
  write("feed.xml", feedXml(all));

  for (const digest of all) {
    write(`archive/${digest.date}.html`, digestPage(digest, "../", "archive"));
    write(`api/digest/${digest.date}.json`, JSON.stringify(digest, null, 2));
  }

  const latest = all.at(-1);
  if (latest) {
    write("index.html", digestPage(latest, ""));
    write("api/digest/latest.json", JSON.stringify(latest, null, 2));
  } else {
    write(
      "index.html",
      digestPage({
        date: new Date().toISOString().slice(0, 10),
        generatedAt: new Date().toISOString(),
        title: "近代日本史研究日报",
        sections: { papers: [], books: [] },
        stats: { fetched: 0, deduped: 0, relevant: 0, byLang: {}, bySource: {}, llmCalls: 0, costUsd: 0 },
        notices: ["还没有生成任何一期日报。"],
      }),
    );
  }

  write("404.html", `<meta charset="utf-8"><p style="font-family:sans-serif;padding:40px">页面不存在。<a href="/">回到首页</a></p>`);

  return { pages: all.length, latest: latest?.date };
}
