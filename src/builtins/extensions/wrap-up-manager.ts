/**
 * Wrap-up Manager - Built-in extension that coordinates wrap-up behavior
 *
 * This extension manages the shared wrap-up state that other extensions
 * can use to coordinate automatic wrap-up triggers. It cannot be disabled.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OtterAssistExtension } from "../../types/index.ts";

/**
 * Shared state for wrap-up coordination across extensions.
 *
 * Other extensions can import this to check or set the wrap-up queued state:
 * - Check before triggering another wrap-up to avoid duplicates
 * - Set to true when queuing a wrap-up command
 */
export const wrapUpState = {
  /** Whether a wrap-up command has already been queued for this session */
  queued: false,
};

/**
 * The wrap-up manager pi extension function.
 * Resets the wrap-up state on each session start.
 */
const piExtension = (pi: ExtensionAPI): void => {
  pi.on("session_start", () => {
    wrapUpState.queued = false;
  });
};

/**
 * Wrap-up Manager built-in extension.
 *
 * This extension is always enabled and provides the coordination flag
 * for other wrap-up related extensions.
 */
export default {
  name: "wrap-up-manager",
  description: "Coordinates wrap-up behavior across extensions",
  version: "1.0.0",
  /** This extension cannot be disabled */
  allowDisable: false,
  piExtension,
} satisfies OtterAssistExtension;
