/**
 * Built-in extensions module
 *
 * Exports all built-in extensions that ship with OtterAssist.
 * These extensions are always available and can be enabled/disabled
 * via the setup wizard (except for required extensions).
 */

import type { OtterAssistExtension } from "../types/index.ts";
import contextThreshold from "./extensions/context-threshold.ts";
import wrapUpManager from "./extensions/wrap-up-manager.ts";

// Re-export wrap-up state for other extensions to use
export { wrapUpState } from "./extensions/wrap-up-manager.ts";

/**
 * All built-in extensions that ship with OtterAssist.
 *
 * These extensions are automatically discovered and loaded by the
 * ExtensionManager. They appear in the setup wizard alongside
 * user-installed extensions.
 */
export const BUILTIN_EXTENSIONS: OtterAssistExtension[] = [
  wrapUpManager,
  contextThreshold,
];

/**
 * Get built-in extensions that cannot be disabled.
 */
export function getRequiredExtensions(): OtterAssistExtension[] {
  return BUILTIN_EXTENSIONS.filter(
    (ext) => (ext as { allowDisable?: boolean }).allowDisable === false,
  );
}

/**
 * Get built-in extensions that can be disabled by the user.
 */
export function getOptionalExtensions(): OtterAssistExtension[] {
  return BUILTIN_EXTENSIONS.filter(
    (ext) => (ext as { allowDisable?: boolean }).allowDisable !== false,
  );
}

// Re-export individual extensions for direct imports
export { contextThreshold, wrapUpManager };
