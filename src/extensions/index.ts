/**
 * Extension system exports
 */

// Re-export ExtensionFactory from pi for extension authors
export type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
// Re-export types
export type {
  EventSourceDefinition,
  // Legacy format (deprecated)
  EventSourceExtension,
  ExtensionContext,
  OAExtensionContext,
  // New format
  OtterAssistExtension,
  PiExtensionFunction,
} from "../types/index.ts";
// Re-export installer
export {
  disableExtension,
  enableExtension,
  getInstalledExtension,
  type InstalledExtension,
  type InstallOptions,
  type InstallResult,
  installExtension,
  listInstalledExtensions,
  uninstallExtension,
} from "./installer.ts";
// Re-export loader
export {
  discoverExtensions,
  GLOBAL_EXTENSIONS_DIR,
  getBuiltinExtensions,
  LOCAL_EXTENSIONS_DIR,
  type LoadedExtension,
  loadExtension,
} from "./loader.ts";
// Re-export manager
export { ExtensionManager } from "./manager.ts";
