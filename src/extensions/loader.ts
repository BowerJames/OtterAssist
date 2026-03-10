/**
 * Extension loader - discovers and loads OtterAssist extensions
 * @see Issue #4 (original event source extensions)
 * @see Issue #23 (enhanced extension system with pi integration)
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import type {
  EventSourceExtension,
  OtterAssistExtension,
} from "../types/index.ts";

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
 * Internal representation of a loaded extension.
 * Normalizes both legacy and new formats for consistent handling.
 */
export interface LoadedExtension {
  name: string;
  description: string;
  version?: string;
  configSchema?: Record<string, unknown>;
  defaultConfig?: unknown;
  /** Event source definition (may be undefined for pi-only extensions) */
  events?: {
    poll(): Promise<string[]>;
    initialize?(config: unknown, context: unknown): Promise<void>;
    shutdown?(): Promise<void>;
  };
  /** Pi extension factory (may be undefined for event-only extensions) */
  piExtension?: ExtensionFactory;
  /** Whether this is a legacy-format extension */
  isLegacy: boolean;
}

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
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Check if it's a .ts file directly
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        const name = basename(entry.name, ".ts");
        discovered.set(name, fullPath);
        continue;
      }

      // Check if it's a directory with index.ts
      if (entry.isDirectory()) {
        const indexPath = join(fullPath, "index.ts");
        if (existsSync(indexPath)) {
          discovered.set(entry.name, indexPath);
        }
      }
    }
  } catch (error) {
    // Directory scan failed, skip silently
    console.warn(`Failed to scan extension directory ${dir}:`, error);
  }
}

/**
 * Validates that an object is a valid legacy EventSourceExtension
 * @deprecated New extensions should use OtterAssistExtension format
 */
function isValidLegacyExtension(obj: unknown): obj is EventSourceExtension {
  if (!obj || typeof obj !== "object") return false;

  const ext = obj as Record<string, unknown>;

  // Legacy format requires poll() at the top level
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
 * Validates that an object is a valid new-format OtterAssistExtension
 */
function isValidNewExtension(obj: unknown): obj is OtterAssistExtension {
  if (!obj || typeof obj !== "object") return false;

  const ext = obj as Record<string, unknown>;

  // Must have name and description
  if (typeof ext.name !== "string" || typeof ext.description !== "string") {
    return false;
  }

  // Must have at least events or piExtension
  const hasEvents = ext.events !== undefined;
  const hasPiExtension = ext.piExtension !== undefined;

  if (!hasEvents && !hasPiExtension) {
    return false;
  }

  // Validate events structure if present
  if (hasEvents) {
    const events = ext.events as Record<string, unknown>;
    if (typeof events.poll !== "function") {
      return false;
    }
    if (
      events.initialize !== undefined &&
      typeof events.initialize !== "function"
    ) {
      return false;
    }
    if (
      events.shutdown !== undefined &&
      typeof events.shutdown !== "function"
    ) {
      return false;
    }
  }

  // Validate piExtension if present
  if (hasPiExtension && typeof ext.piExtension !== "function") {
    return false;
  }

  // Optional fields validation
  if (ext.version !== undefined && typeof ext.version !== "string") {
    return false;
  }
  if (ext.configSchema !== undefined && typeof ext.configSchema !== "object") {
    return false;
  }

  return true;
}

/**
 * Loads an extension module and normalizes it to LoadedExtension format.
 *
 * Supports both formats:
 * - Legacy EventSourceExtension (poll at top level)
 * - New OtterAssistExtension (events.poll + optional piExtension)
 *
 * @param extensionPath - Path to the extension module
 * @returns Normalized LoadedExtension object
 */
export async function loadExtension(
  extensionPath: string,
): Promise<LoadedExtension> {
  try {
    // Bun can import TypeScript directly
    const module = await import(extensionPath);

    // Support both default export and named export
    const extension = module.default ?? module.extension ?? module;

    // Try new format first
    if (isValidNewExtension(extension)) {
      return {
        name: extension.name,
        description: extension.description,
        version: extension.version,
        configSchema: extension.configSchema,
        defaultConfig: extension.defaultConfig,
        events: extension.events
          ? {
              poll: extension.events.poll.bind(extension.events),
              initialize: extension.events.initialize?.bind(extension.events),
              shutdown: extension.events.shutdown?.bind(extension.events),
            }
          : undefined,
        piExtension: extension.piExtension,
        isLegacy: false,
      };
    }

    // Fall back to legacy format
    if (isValidLegacyExtension(extension)) {
      return {
        name: extension.name,
        description: extension.description,
        configSchema: extension.configSchema,
        defaultConfig: extension.defaultConfig,
        events: {
          poll: extension.poll.bind(extension),
          initialize: extension.initialize?.bind(extension),
          shutdown: extension.shutdown?.bind(extension),
        },
        piExtension: undefined,
        isLegacy: true,
      };
    }

    // Neither format matched
    throw new Error(
      `Module ${extensionPath} does not export a valid extension. ` +
        "Expected OtterAssistExtension (name, description, events?, piExtension?) " +
        "or legacy EventSourceExtension (name, description, poll).",
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load extension from ${extensionPath}: ${error.message}`,
      );
    }
    throw error;
  }
}
