/**
 * Extension loader - discovers and loads event source extensions
 * @see Issue #4
 */

import type { EventSourceExtension } from "../types/index.ts";

/**
 * Discovers extensions from global and project-local directories
 */
export async function discoverExtensions(): Promise<string[]> {
  throw new Error("Not implemented - Issue #4");
}

/**
 * Loads an extension module
 */
export async function loadExtension(
  _extensionPath: string,
): Promise<EventSourceExtension> {
  throw new Error("Not implemented - Issue #4");
}
