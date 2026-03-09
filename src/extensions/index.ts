/**
 * Extension system exports
 */

// Re-export types
export type {
  // New format
  OtterAssistExtension,
  OAExtensionContext,
  EventSourceDefinition,
  PiExtensionFunction,
  // Legacy format (deprecated)
  EventSourceExtension,
  ExtensionContext,
} from "../types/index.ts";

// Re-export ExtensionFactory from pi for extension authors
export type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

// Re-export loader
export {
  type LoadedExtension,
  discoverExtensions,
  GLOBAL_EXTENSIONS_DIR,
  LOCAL_EXTENSIONS_DIR,
  loadExtension,
} from "./loader.ts";

// Re-export manager
export { ExtensionManager } from "./manager.ts";
