import { createHash } from "node:crypto";

export function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

/** NFKC + lowercase + strip punctuation/whitespace, for title fingerprints. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // Prefer to cut at a sentence boundary when one is close to the limit.
  const lastStop = Math.max(
    cut.lastIndexOf("。"),
    cut.lastIndexOf("."),
    cut.lastIndexOf("！"),
    cut.lastIndexOf("？"),
  );
  if (lastStop > max * 0.6) return cut.slice(0, lastStop + 1);
  return cut.trimEnd() + "…";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function toIsoDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const match = String(value).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!match) return undefined;
  const [, y, m = "01", d = "01"] = match;
  return `${y}-${m}-${d}`;
}

export function ageInDays(iso: string, now = new Date()): number {
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return 3650;
  return Math.max(0, (now.getTime() - then) / 86_400_000);
}

export function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Detect the dominant script so unlabelled records get a sensible language. */
export function detectLang(text: string): "zh" | "en" | "ja" | "ko" {
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return "ko";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "ja";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  return "en";
}
