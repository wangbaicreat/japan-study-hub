import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  AppConfig,
  SourcesConfig,
  TopicsConfig,
  VenuesConfig,
  WeightsConfig,
} from "./types.ts";
import { paths } from "./paths.ts";

function readYaml<T>(file: string): T {
  const full = path.join(paths.config, file);
  return YAML.parse(fs.readFileSync(full, "utf8")) as T;
}

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  cached = {
    topics: readYaml<TopicsConfig>("topics.yaml"),
    venues: readYaml<VenuesConfig>("venues.yaml"),
    weights: readYaml<WeightsConfig>("weights.yaml"),
    sources: readYaml<SourcesConfig>("sources.yaml"),
  };
  return cached;
}

/** Read an env var, treating empty strings as absent. */
export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}
