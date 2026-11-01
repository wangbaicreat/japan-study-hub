import { loadConfig } from "./lib/config.ts";
import {
  addDays,
  appendItems,
  ensureDirs,
  loadSeen,
  readDigest,
  readItemsSince,
  saveSeen,
  todayIso,
  writeDigest,
} from "./lib/store.ts";
import { collectAll } from "./collect.ts";
import { buildDigest } from "./digest.ts";
import { buildSite } from "./site/build.ts";
import { sendDigest } from "./email.ts";
import { syncJstor } from "./sources/jstor.ts";

type Args = {
  command: string;
  date: string;
  days: number;
  noLlm: boolean;
  ignoreSeen: boolean;
  skipNetwork: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[0] ?? "run",
    date: todayIso(),
    days: 7,
    noLlm: argv.includes("--no-llm"),
    ignoreSeen: argv.includes("--ignore-seen"),
    skipNetwork: argv.includes("--offline"),
    force: argv.includes("--force"),
  };
  const dateIndex = argv.indexOf("--date");
  if (dateIndex >= 0 && argv[dateIndex + 1]) args.date = argv[dateIndex + 1] as string;
  const daysIndex = argv.indexOf("--days");
  if (daysIndex >= 0 && argv[daysIndex + 1]) args.days = Number(argv[daysIndex + 1]);
  return args;
}

async function makeDigest(args: Args, ignoreSeen: boolean): Promise<void> {
  const config = loadConfig();
  const items = readItemsSince(addDays(args.date, -400));
  const seen = loadSeen();

  // Rebuilding an existing day must not treat that day's own picks as "seen",
  // otherwise a second run would output a different, thinner digest.
  if (!ignoreSeen) {
    const existing = readDigest(args.date);
    if (existing) {
      for (const item of [...existing.sections.papers, ...existing.sections.books]) {
        seen.delete(item.id);
      }
    }
  }
  const digest = await buildDigest({
    date: args.date,
    items,
    config,
    seen,
    ignoreSeen,
    useLlm: !args.noLlm,
  });
  writeDigest(digest);

  if (!ignoreSeen) {
    for (const item of [...digest.sections.papers, ...digest.sections.books]) seen.add(item.id);
    saveSeen(seen);
  }

  const total = digest.sections.papers.length + digest.sections.books.length;
  console.log(
    `[digest] ${args.date}: ${total} items ` +
      `(papers ${digest.sections.papers.length}, books ${digest.sections.books.length}) ` +
      `from ${digest.stats.relevant}/${digest.stats.deduped} relevant candidates`,
  );
  if (digest.notices.length > 0) console.log(`[digest] notices: ${digest.notices.join("; ")}`);
}

async function commandRun(args: Args): Promise<void> {
  ensureDirs();
  const items = await collectAll({ skipNetwork: args.skipNetwork });
  const added = appendItems(args.date, items);
  console.log(`[collect] stored ${added} new items`);

  await makeDigest(args, args.ignoreSeen);
  const built = buildSite();
  console.log(`[site] ${built.pages} digests rendered, latest=${built.latest ?? "none"}`);

  const digest = await import("./lib/store.ts").then((store) => store.readDigest(args.date));
  if (digest) {
    const result = await sendDigest(digest);
    console.log(`[email] ${result.provider} ok=${result.ok}${result.detail ? ` (${result.detail})` : ""}`);
  }
}

async function commandBackfill(args: Args): Promise<void> {
  ensureDirs();
  const config = loadConfig();
  const seen = loadSeen();
  for (let offset = args.days - 1; offset >= 0; offset--) {
    const date = addDays(args.date, -offset);
    const items = readItemsSince(addDays(date, -400));
    if (items.length === 0) {
      console.log(`[backfill] ${date}: no stored items, skipped`);
      continue;
    }
    const digest = await buildDigest({
      date,
      items,
      config,
      seen,
      ignoreSeen: true,
      useLlm: !args.noLlm,
    });
    writeDigest(digest);
    console.log(
      `[backfill] ${date}: ${digest.sections.papers.length} papers, ${digest.sections.books.length} books`,
    );
  }
  buildSite();
}

async function probe(name: string, url: string, headers: Record<string, string> = {}): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "nihon-digest/0.1", ...headers },
      signal: AbortSignal.timeout(20_000),
    });
    console.log(`${name.padEnd(14)} HTTP ${response.status}`);
  } catch (error) {
    console.log(`${name.padEnd(14)} FAILED  ${(error as Error).message}`);
  }
}

async function commandDoctor(): Promise<void> {
  console.log("── 数据源连通性 ──────────────────────────────");
  await probe("OpenAlex", "https://api.openalex.org/works?per-page=1");
  await probe("Crossref", "https://api.crossref.org/works?rows=1");
  await probe(
    "J-STAGE",
    "https://api.jstage.jst.go.jp/searchapi/do?service=3&article=%E6%97%A5%E6%9C%AC&count=1",
  );
  await probe(
    "JSTOR KBART",
    "https://www.jstor.org/kbart/collections/all-archive-titles?contentType=journals",
  );
  await probe("KCI", "https://openapi.kci.go.kr");
  await probe("CiNii", "https://cir.nii.ac.jp/opensearch/all?q=test&format=json&count=1");
  await probe("NDL", "https://ndlsearch.ndl.go.jp/api/opensearch?any=test&cnt=1");
  await probe("日本学刊", "https://rbxk.ajcass.com/");

  console.log("\n── 密钥 ────────────────────────────────────");
  const { env } = await import("./lib/config.ts");

  const openalexKey = env("OPENALEX_KEY");
  if (!openalexKey) {
    console.log("OPENALEX_KEY   ✗ 未设置（匿名额度只有全网络共享的 $0.10/天，会 429）");
    console.log("               申请：https://openalex.org/settings/api");
  } else {
    try {
      const response = await fetch(
        `https://api.openalex.org/works?per-page=1&api_key=${encodeURIComponent(openalexKey)}`,
        { signal: AbortSignal.timeout(20_000) },
      );
      const data = (await response.json()) as {
        meta?: { notice?: string; cost_usd?: number; count?: number };
      };
      const notice = data.meta?.notice ?? "";
      if (response.ok && !notice.includes("No API key")) {
        console.log(`OPENALEX_KEY   ✓ 有效（本次查询花费 $${data.meta?.cost_usd ?? "?"}）`);
      } else {
        console.log(`OPENALEX_KEY   ✗ 无效或未生效：${notice.slice(0, 80) || response.status}`);
      }
    } catch (error) {
      console.log(`OPENALEX_KEY   ? 无法验证：${(error as Error).message}`);
    }
  }

  const llmKey = env("LLM_API_KEY");
  if (!llmKey) {
    console.log("LLM_API_KEY    ○ 未设置（简介将使用原文摘要，不翻译）");
    console.log("               申请：https://platform.deepseek.com/");
  } else {
    const base = (env("LLM_BASE_URL") ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
    try {
      const response = await fetch(`${base}/models`, {
        headers: { authorization: `Bearer ${llmKey}` },
        signal: AbortSignal.timeout(20_000),
      });
      console.log(`LLM_API_KEY    ${response.ok ? "✓ 有效" : `✗ HTTP ${response.status}`}（${env("LLM_MODEL") ?? "deepseek-chat"}）`);
    } catch (error) {
      console.log(`LLM_API_KEY    ? 无法连接：${(error as Error).message}`);
    }
  }

  const kciKey = env("KCI_API_KEY");
  console.log(`KCI_API_KEY    ${kciKey ? "✓ 已设置（首次接入需按 KCI 指南核对接口路径）" : "○ 未设置（韩文由 OpenAlex 兜底）"}`);
  console.log(`CINII_APPID    ${env("CINII_APPID") ? "✓ 已设置" : "○ 未设置"}`);
  console.log(`NDL_APPID      ${env("NDL_APPID") ? "✓ 已设置" : "○ 未设置（该源默认关闭）"}`);
  console.log(
    `EMAIL          ${env("EMAIL_PROVIDER") ?? "dry-run"} ${env("BUTTONDOWN_API_KEY") || env("RESEND_API_KEY") ? "✓" : "○ 未配置密钥，只写 data/outbox/"}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "collect": {
      ensureDirs();
      const items = await collectAll({ skipNetwork: args.skipNetwork });
      const added = appendItems(args.date, items);
      console.log(`[collect] stored ${added} new items`);
      break;
    }
    case "digest": {
      ensureDirs();
      await makeDigest(args, args.ignoreSeen);
      break;
    }
    case "site": {
      const built = buildSite();
      console.log(`[site] ${built.pages} digests rendered, latest=${built.latest ?? "none"}`);
      break;
    }
    case "backfill": {
      await commandBackfill(args);
      break;
    }
    case "send": {
      const { readDigest } = await import("./lib/store.ts");
      const digest = readDigest(args.date);
      if (!digest) {
        console.error(`[email] no digest for ${args.date}`);
        process.exitCode = 1;
        break;
      }
      const result = await sendDigest(digest);
      console.log(`[email] ${result.provider} ok=${result.ok}${result.detail ? ` (${result.detail})` : ""}`);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    case "jstor": {
      ensureDirs();
      await syncJstor(0, true);
      break;
    }
    case "doctor": {
      await commandDoctor();
      break;
    }
    case "run":
    default: {
      await commandRun(args);
      break;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
