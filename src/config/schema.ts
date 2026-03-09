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
  if (typeof config !== "object" || config === null) {
    return false;
  }

  const cfg = config as Record<string, unknown>;

  // Validate pollIntervalSeconds
  if (
    typeof cfg.pollIntervalSeconds !== "number" ||
    cfg.pollIntervalSeconds <= 0 ||
    !Number.isFinite(cfg.pollIntervalSeconds)
  ) {
    return false;
  }

  // Validate extensions object
  if (typeof cfg.extensions !== "object" || cfg.extensions === null) {
    return false;
  }

  // Validate each extension entry
  const extensions = cfg.extensions as Record<string, unknown>;
  for (const [, extConfig] of Object.entries(extensions)) {
    if (typeof extConfig !== "object" || extConfig === null) {
      return false;
    }
    const ext = extConfig as Record<string, unknown>;
    if (typeof ext.enabled !== "boolean") {
      return false;
    }
    // config field is optional, can be any object if present
    if (ext.config !== undefined && typeof ext.config !== "object") {
      return false;
    }
  }

  return true;
}
