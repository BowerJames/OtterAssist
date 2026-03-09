/**
 * Extension loader - discovers and loads event source extensions
 * @see Issue #4
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { EventSourceExtension } from "../types/index.ts";

/** Global extension directory */
export const GLOBAL_EXTENSIONS_DIR = join(
  homedir(),
  ".otterassist",
  "extensions",
);

/** Project-local extension directory */
export const LOCAL_EXTENSIONS_DIR = join(
  process.cwd(),
  ".otterassist",
  "extensions",
);

/**
 * Discovers extensions from global and project-local directories
 * Returns paths to extension entry points
 */
export async function discoverExtensions(): Promise<string[]> {
  const discovered: Map<string, string> = new Map();

  // Scan global directory first
  await scanDirectory(GLOBAL_EXTENSIONS_DIR, discovered);

  // Scan project-local directory (overrides global with same name)
  await scanDirectory(LOCAL_EXTENSIONS_DIR, discovered);

  return [...discovered.values()];
}

/**
 * Scans a directory for extensions
 * Supports both .ts files and directory/index.ts structures
 */
async function scanDirectory(
  dir: string,
  discovered: Map<string, string>,
): Promise<void> {
  if (!existsSync(dir)) {
    return;
  }

  try {
    const entries = await Array.fromAsync(new Bun.Glob("*").scan(dir));

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      // Check if it's a .ts file directly
      if (entry.endsWith(".ts")) {
        const name = basename(entry, ".ts");
        discovered.set(name, fullPath);
        continue;
      }

      // Check if it's a directory with index.ts
      const indexPath = join(fullPath, "index.ts");
      if (existsSync(indexPath)) {
        discovered.set(entry, indexPath);
      }
    }
  } catch (error) {
    // Directory scan failed, skip silently
    console.warn(`Failed to scan extension directory ${dir}:`, error);
  }
}

/**
 * Validates that an object is a valid EventSourceExtension
 */
function isValidExtension(obj: unknown): obj is EventSourceExtension {
  if (!obj || typeof obj !== "object") return false;

  const ext = obj as Record<string, unknown>;

  return (
    typeof ext.name === "string" &&
    typeof ext.description === "string" &&
    typeof ext.poll === "function" &&
    (ext.initialize === undefined || typeof ext.initialize === "function") &&
    (ext.shutdown === undefined || typeof ext.shutdown === "function") &&
    (ext.configSchema === undefined || typeof ext.configSchema === "object") &&
    (ext.defaultConfig === undefined || ext.defaultConfig !== null)
  );
}

/**
 * Loads an extension module
 * Validates that the module exports a valid EventSourceExtension
 */
export async function loadExtension(
  extensionPath: string,
): Promise<EventSourceExtension> {
  try {
    // Bun can import TypeScript directly
    const module = await import(extensionPath);

    // Support both default export and named export
    const extension = module.default ?? module.extension ?? module;

    if (!isValidExtension(extension)) {
      throw new Error(
        `Module ${extensionPath} does not export a valid EventSourceExtension. ` +
          "Expected object with: name (string), description (string), poll (function)",
      );
    }

    return extension;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load extension from ${extensionPath}: ${error.message}`,
      );
    }
    throw error;
  }
}
