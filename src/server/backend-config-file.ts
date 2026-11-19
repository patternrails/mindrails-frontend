import { readFile } from "node:fs/promises";
import { parseBackendConfig, type BackendConfig } from "../lib/backend-config.ts";

/** Deployment configuration is read-only; browser requests never write this file. */
export async function readBackendConfigFile(path: string): Promise<BackendConfig> {
  const config = parseBackendConfig(await readFile(path, "utf8"));
  if (!config) throw new Error("Invalid backend configuration file.");
  return config;
}
