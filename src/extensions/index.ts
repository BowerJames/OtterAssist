/**
 * Extension system exports
 */

export type { EventSourceExtension, ExtensionContext } from "../types/index.ts";
export {
  discoverExtensions,
  GLOBAL_EXTENSIONS_DIR,
  LOCAL_EXTENSIONS_DIR,
  loadExtension,
} from "./loader.ts";
export { ExtensionManager } from "./manager.ts";
