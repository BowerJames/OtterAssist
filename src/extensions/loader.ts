/**
 * Extension loader - discovers and loads OtterAssist extensions
 * @see Issue #4 (original event source extensions)
 * @see Issue #23 (enhanced extension system with pi integration)
 * @see Issue #37 (built-in extensions for wrap-up coordination)
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { BUILTIN_EXTENSIONS } from "../builtins/index.ts";
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
  /** Whether this extension can be disabled by the user */
  allowDisable: boolean;
  /** Whether this is a built-in extension (ships with OtterAssist) */
  isBuiltin: boolean;
  /** Whether this is a directory-based extension (can be configurable) */
  isDirectory: boolean;
  /** Path to the extension's directory (or parent dir for single-file extensions) */
  extensionDir: string;
  /** Event source definition (may be undefined for pi-only extensions) */
  events?: {
    poll(): Promise<string[]>;
    initialize?(context: unknown): Promise<void>;
    shutdown?(): Promise<void>;
  };
  /** Pi extension factory (may be undefined for event-only extensions) */
  piExtension?: ExtensionFactory;
  /** Top-level initialize for pi-only extensions (may be undefined) */
  initialize?(context: unknown): Promise<void>;
  /** Configure method (may be undefined for non-configurable extensions) */
  configure?(context: unknown): Promise<boolean>;
  /** Whether this is a legacy-format extension */
  isLegacy: boolean;
}

/**
 * Internal representation of a discovered extension path.
 */
interface DiscoveredExtension {
  /** Path to the extension entry point (index.ts or file.ts) */
  entryPath: string;
  /** Path to the extension's directory (for directory-based extensions) */
  extensionDir: string;
  /** Whether this is a directory-based extension */
  isDirectory: boolean;
}

/**
 * Discovers extensions from global and project-local directories.
 * Returns information about each discovered extension including whether it's directory-based.
 */
export async function discoverExtensions(): Promise<DiscoveredExtension[]> {
  const discovered: Map<string, DiscoveredExtension> = new Map();

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
  discovered: Map<string, DiscoveredExtension>,
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
        discovered.set(name, {
          entryPath: fullPath,
          extensionDir: dir, // Parent directory for single-file extensions
          isDirectory: false,
        });
        continue;
      }

      // Check if it's a directory with index.ts
      if (entry.isDirectory()) {
        const indexPath = join(fullPath, "index.ts");
        if (existsSync(indexPath)) {
          discovered.set(entry.name, {
            entryPath: indexPath,
            extensionDir: fullPath, // The directory itself
            isDirectory: true,
          });
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
 * Converts an OtterAssistExtension to LoadedExtension format.
 */
function extensionToLoaded(
  extension: OtterAssistExtension,
  isBuiltin: boolean,
  extensionDir: string,
  isDirectory: boolean,
): LoadedExtension {
  return {
    name: extension.name,
    description: extension.description,
    version: extension.version,
    configSchema: extension.configSchema,
    defaultConfig: extension.defaultConfig,
    allowDisable: extension.allowDisable !== false,
    isBuiltin,
    isDirectory,
    extensionDir,
    events: extension.events
      ? {
          poll: extension.events.poll.bind(extension.events),
          initialize: extension.events.initialize?.bind(extension.events),
          shutdown: extension.events.shutdown?.bind(extension.events),
        }
      : undefined,
    piExtension: extension.piExtension as ExtensionFactory | undefined,
    initialize: extension.initialize?.bind(extension),
    configure: extension.configure?.bind(extension),
    isLegacy: false,
  };
}

/**
 * Gets all built-in extensions as LoadedExtension objects.
 *
 * Built-in extensions ship with OtterAssist and are always available.
 * They can be enabled/disabled via config (except those with allowDisable: false).
 *
 * Built-in extensions are stored in ~/.otterassist/builtins/<name>/
 *
 * @returns Array of built-in extensions in LoadedExtension format
 */
export function getBuiltinExtensions(): LoadedExtension[] {
  const builtinsDir = join(homedir(), ".otterassist", "builtins");

  return BUILTIN_EXTENSIONS.map((ext) =>
    extensionToLoaded(ext, true, join(builtinsDir, ext.name), true)
  );
}

/**
 * Loads an extension module and normalizes it to LoadedExtension format.
 *
 * Supports both formats:
 * - Legacy EventSourceExtension (poll at top level)
 * - New OtterAssistExtension (events.poll + optional piExtension)
 *
 * @param discovered - Discovered extension information
 * @returns Normalized LoadedExtension object
 */
export async function loadExtension(
  discovered: DiscoveredExtension,
): Promise<LoadedExtension> {
  const { entryPath, extensionDir, isDirectory } = discovered;

  try {
    // Bun can import TypeScript directly
    const module = await import(entryPath);

    // Support both default export and named export
    const extension = module.default ?? module.extension ?? module;

    // Try new format first
    if (isValidNewExtension(extension)) {
      // Single-file extensions cannot have configure method
      if (!isDirectory && extension.configure) {
        throw new Error(
          `Single-file extension at ${entryPath} cannot have a configure method. ` +
            "Use directory format (extension/index.ts) for configurable extensions.",
        );
      }

      return extensionToLoaded(extension, false, extensionDir, isDirectory);
    }

    // Fall back to legacy format
    if (isValidLegacyExtension(extension)) {
      return {
        name: extension.name,
        description: extension.description,
        configSchema: extension.configSchema,
        defaultConfig: extension.defaultConfig,
        allowDisable: true,
        isBuiltin: false,
        isDirectory,
        extensionDir,
        events: {
          poll: extension.poll.bind(extension),
          // Legacy extensions have (config, context) signature, we ignore config now
          initialize: extension.initialize
            ? async (context: unknown) => {
                // Legacy initialize expects (config, context), pass undefined for config
                await extension.initialize!(undefined, context as import("../types/index.ts").ExtensionContext);
              }
            : undefined,
          shutdown: extension.shutdown?.bind(extension),
        },
        piExtension: undefined,
        configure: undefined,
        isLegacy: true,
      };
    }

    // Neither format matched
    throw new Error(
      `Module ${entryPath} does not export a valid extension. ` +
        "Expected OtterAssistExtension (name, description, events?, piExtension?) " +
        "or legacy EventSourceExtension (name, description, poll).",
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load extension from ${entryPath}: ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Helper to load an extension from just an entry point path.
 * Determines if it's a directory or file-based extension automatically.
 *
 * This is a convenience function for the installer and other code that
 * has a path but doesn't need the full discovery process.
 *
 * @param entryPath - Path to the extension entry point (index.ts or file.ts)
 * @returns Normalized LoadedExtension object
 */
export async function loadExtensionFromPath(
  entryPath: string,
): Promise<LoadedExtension> {
  const { dirname, basename } = await import("node:path");
  const { existsSync } = await import("node:fs");

  // Determine if this is a directory-based or file-based extension
  const dir = dirname(entryPath);
  const fileName = basename(entryPath);

  // If the file is named "index.ts", it's a directory-based extension
  const isDirectory = fileName === "index.ts";
  const extensionDir = isDirectory ? dir : dir;

  return loadExtension({
    entryPath,
    extensionDir,
    isDirectory,
  });
}
