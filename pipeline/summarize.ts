import fs from "node:fs";
import path from "node:path";
import { env } from "./lib/config.ts";
import { paths } from "./lib/paths.ts";
import { sha1, truncate } from "./lib/util.ts";
import type { Item } from "./lib/types.ts";

/**
 * Chinese title + 2-3 sentence introduction. Optional: without an API key the
 * digest still ships, using the original abstract as the introduction.
 */

export type LlmStats = { calls: number; costUsd: number; model?: string };

type Cached = { titleZh?: string; introZh?: string };

const PROMPT_VERSION = "v1";
const BATCH_SIZE = 6;
// Rough DeepSeek pricing, USD per 1M tokens. Only used for the cost report.
const PRICE_IN = 0.27 / 1_000_000;
const PRICE_OUT = 1.1 / 1_000_000;

function cachePath(id: string, model: string): string {
  return path.join(paths.cache, "llm", `${sha1(`${id}|${PROMPT_VERSION}|${model}`)}.json`);
}

function readCache(id: string, model: string): Cached | undefined {
  try {
    return JSON.parse(fs.readFileSync(cachePath(id, model), "utf8")) as Cached;
  } catch {
    return undefined;
  }
}

function writeCache(id: string, model: string, value: Cached): void {
  const file = cachePath(id, model);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

const SYSTEM_PROMPT = `你是一位中日英韩四语兼通的日本近代史（1868年以后）学术编辑。
你会收到一批文献题录，请为每一条输出：
1. titleZh：中文标题（若原标题已是中文则原样返回；日文汉字标题请转写为规范中文，不要保留日文假名）。
2. introZh：2–3 句中文简介，共 80–120 字，依次说明：研究问题、主要材料/方法、核心结论。
要求：只依据给出的标题和摘要，不要编造史料、数据或结论；摘要缺失时只概括标题所示主题。不要出现"本文"以外的评价性套话。
严格输出 JSON：{"items":[{"id":"...","titleZh":"...","introZh":"..."}]}`;

type LlmItem = { id: string; title: string; abstract?: string; venue?: string; lang: string };

async function callLlm(batch: LlmItem[], stats: LlmStats): Promise<Map<string, Cached>> {
  const baseUrl = env("LLM_BASE_URL") ?? "https://api.deepseek.com/v1";
  const apiKey = env("LLM_API_KEY");
  const model = env("LLM_MODEL") ?? "deepseek-chat";
  if (!apiKey) return new Map();

  const payload = {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          items: batch.map((item) => ({
            id: item.id,
            title: item.title,
            abstract: item.abstract ? truncate(item.abstract, 1200) : undefined,
            venue: item.venue,
            lang: item.lang,
          })),
        }),
      },
    ],
  };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`llm HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  stats.calls++;
  stats.model = model;
  stats.costUsd +=
    (data.usage?.prompt_tokens ?? 0) * PRICE_IN + (data.usage?.completion_tokens ?? 0) * PRICE_OUT;

  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { items?: { id: string; titleZh?: string; introZh?: string }[] };
  const result = new Map<string, Cached>();
  for (const entry of parsed.items ?? []) {
    if (!entry.id) continue;
    result.set(entry.id, { titleZh: entry.titleZh, introZh: entry.introZh });
  }
  return result;
}

export async function summarize(items: Item[], stats: LlmStats): Promise<void> {
  const model = env("LLM_MODEL") ?? "deepseek-chat";
  const pending: Item[] = [];

  for (const item of items) {
    const cached = readCache(item.id, model);
    if (cached) {
      item.titleZh = cached.titleZh;
      item.introZh = cached.introZh;
    } else {
      pending.push(item);
    }
  }
  if (pending.length === 0) return;
  if (!env("LLM_API_KEY")) {
    console.log(`[llm] no LLM_API_KEY; ${pending.length} items keep their original abstract`);
    return;
  }

  for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
    const batch = pending.slice(offset, offset + BATCH_SIZE);
    try {
      const results = await callLlm(
        batch.map((item) => ({
          id: item.id,
          title: item.title,
          abstract: item.abstract,
          venue: item.venue?.name,
          lang: item.lang,
        })),
        stats,
      );
      for (const item of batch) {
        const value = results.get(item.id);
        if (!value?.introZh) continue;
        item.titleZh = value.titleZh;
        item.introZh = value.introZh;
        writeCache(item.id, model, value);
      }
    } catch (error) {
      console.warn("[llm] batch failed:", (error as Error).message);
    }
  }
}
