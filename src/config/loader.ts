/**
 * Configuration loader
 * @see Issue #3
 */

import type { Config } from "../types/index.ts";

/**
 * Loads configuration from ~/.otterassist/config.json
 */
export async function loadConfig(): Promise<Config> {
  throw new Error("Not implemented - Issue #3");
}

/**
 * Saves configuration to disk
 */
export async function saveConfig(_config: Config): Promise<void> {
  throw new Error("Not implemented - Issue #3");
}
