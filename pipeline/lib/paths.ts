import path from "node:path";

/** Repository root (the folder that contains package.json and config/). */
export const ROOT = path.resolve(import.meta.dirname, "..", "..");

export const paths = {
  root: ROOT,
  config: path.join(ROOT, "config"),
  data: path.join(ROOT, "data"),
  items: path.join(ROOT, "data", "items"),
  digests: path.join(ROOT, "data", "digests"),
  jstor: path.join(ROOT, "data", "jstor"),
  cache: path.join(ROOT, "data", "cache"),
  outbox: path.join(ROOT, "data", "outbox"),
  public: path.join(ROOT, "public"),
  seen: path.join(ROOT, "data", "seen.json"),
  stats: path.join(ROOT, "data", "stats.json"),
};
