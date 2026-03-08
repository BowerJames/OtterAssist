/**
 * Configuration schema definition
 * @see Issue #3
 */

import type { Config } from "../types/index.ts";

/**
 * Default configuration values
 */
export const defaultConfig: Config = {
  pollIntervalSeconds: 300,
  extensions: {},
};

/**
 * Validates the configuration object
 */
export function validateConfig(config: unknown): config is Config {
  // Placeholder - will be implemented in Issue #3
  return true;
}
