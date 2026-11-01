import fs from "node:fs";
import path from "node:path";
import { env } from "./lib/config.ts";
import { paths } from "./lib/paths.ts";
import type { Digest } from "./lib/types.ts";
import { emailHtml, emailText, formatDate } from "./site/templates.ts";

type SendResult = { provider: string; ok: boolean; detail?: string };

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function sendButtondown(digest: Digest): Promise<SendResult> {
  const key = env("BUTTONDOWN_API_KEY");
  if (!key) return { provider: "buttondown", ok: false, detail: "BUTTONDOWN_API_KEY missing" };
  const response = await retry(() =>
    fetch("https://api.buttondown.email/v1/emails", {
      method: "POST",
      headers: { authorization: `Token ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        subject: `${formatDate(digest.date)} · 近代日本史研究日报`,
        body: emailHtml(digest),
        status: "about_to_send",
      }),
    }),
  );
  return {
    provider: "buttondown",
    ok: response.ok,
    detail: response.ok ? undefined : `${response.status} ${(await response.text()).slice(0, 200)}`,
  };
}

async function sendResend(digest: Digest): Promise<SendResult> {
  const key = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM");
  const to = env("EMAIL_TO");
  if (!key) return { provider: "resend", ok: false, detail: "RESEND_API_KEY missing" };
  if (!from || !to) return { provider: "resend", ok: false, detail: "EMAIL_FROM / EMAIL_TO missing" };

  const response = await retry(() =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: to.split(",").map((address) => address.trim()),
        subject: `${formatDate(digest.date)} · 近代日本史研究日报`,
        html: emailHtml(digest).replace(/\{\{unsubscribe_url\}\}/g, "#"),
        text: emailText(digest),
      }),
    }),
  );
  return {
    provider: "resend",
    ok: response.ok,
    detail: response.ok ? undefined : `${response.status} ${(await response.text()).slice(0, 200)}`,
  };
}

async function sendDryRun(digest: Digest): Promise<SendResult> {
  fs.mkdirSync(paths.outbox, { recursive: true });
  fs.writeFileSync(path.join(paths.outbox, `${digest.date}.html`), emailHtml(digest));
  fs.writeFileSync(path.join(paths.outbox, `${digest.date}.txt`), emailText(digest));
  return { provider: "dry-run", ok: true, detail: `written to data/outbox/${digest.date}.html` };
}

export async function sendDigest(digest: Digest): Promise<SendResult> {
  const provider = (env("EMAIL_PROVIDER") ?? "dry-run").toLowerCase();
  try {
    if (provider === "buttondown") return await sendButtondown(digest);
    if (provider === "resend") return await sendResend(digest);
    return await sendDryRun(digest);
  } catch (error) {
    return { provider, ok: false, detail: (error as Error).message };
  }
}
