/**
 * Configuration loader
 * @see Issue #3
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Config } from "../types/index.ts";
import { defaultConfig, validateConfig } from "./schema.ts";

/** Path to the config directory */
export const CONFIG_DIR = join(homedir(), ".otterassist");

/** Path to the config file */
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

/**
 * Deep merges two objects, with override taking precedence
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result = { ...base } as Record<string, unknown>;

  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      key in result &&
      typeof result[key] === "object" &&
      result[key] !== null
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Loads configuration from ~/.otterassist/config.json
 * Returns default config if file doesn't exist
 * Merges with defaults for partial configs
 */
export async function loadConfig(): Promise<Config> {
  try {
    const file = Bun.file(CONFIG_PATH);
    const exists = await file.exists();

    if (!exists) {
      return { ...defaultConfig };
    }

    const content = await file.text();
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Merge with defaults to handle partial configs
    const merged = deepMerge(
      defaultConfig as unknown as Record<string, unknown>,
      parsed,
    );

    if (!validateConfig(merged)) {
      throw new Error(
        `Invalid configuration in ${CONFIG_PATH}. Check that pollIntervalSeconds is a positive number and extensions have proper structure.`,
      );
    }

    return merged;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse config file ${CONFIG_PATH}: ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Saves configuration to disk
 * Creates the config directory if it doesn't exist
 */
export async function saveConfig(config: Config): Promise<void> {
  if (!validateConfig(config)) {
    throw new Error("Cannot save invalid configuration");
  }

  // Ensure directory exists
  await mkdir(dirname(CONFIG_PATH), { recursive: true });

  // Write with pretty formatting
  const content = JSON.stringify(config, null, 2);

  // Atomic write: write to temp file, then rename
  const tempPath = `${CONFIG_PATH}.tmp`;
  await writeFile(tempPath, content, "utf-8");

  // Rename is atomic on most filesystems
  await rename(tempPath, CONFIG_PATH);
}
