/**
 * Context Threshold - Built-in extension that auto-triggers wrap-up
 *
 * Monitors context usage after each turn and automatically queues
 * the /wrap_up command when context exceeds the threshold (80%).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OtterAssistExtension } from "../../types/index.ts";
import { wrapUpState } from "./wrap-up-manager.ts";

/**
 * Default context threshold (80% of context window).
 * When context usage reaches this level, wrap-up is triggered.
 */
const DEFAULT_THRESHOLD = 0.8;

/**
 * The context threshold pi extension function.
 * Monitors turn_end events and triggers wrap-up when threshold exceeded.
 */
const piExtension = (pi: ExtensionAPI): void => {
  pi.on("turn_end", (_event, ctx) => {
    // Skip if wrap-up already queued by another extension
    if (wrapUpState.queued) {
      return;
    }

    // Get current context usage
    const usage = ctx.getContextUsage();
    if (!usage || usage.percent === null) {
      return;
    }

    const thresholdPercent = DEFAULT_THRESHOLD * 100;

    // Check if threshold exceeded
    if (usage.percent >= thresholdPercent) {
      // Set the flag to prevent duplicate wrap-ups
      wrapUpState.queued = true;

      // Notify user if UI is available
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Context at ${usage.percent.toFixed(1)}% (threshold: ${thresholdPercent}%). Queuing /wrap_up...`,
          "warning",
        );
      }

      // Queue the wrap_up command as a follow-up message
      pi.sendUserMessage("/wrap_up", { deliverAs: "followUp" });
    }
  });
};

/**
 * Context Threshold built-in extension.
 *
 * This extension can be enabled/disabled via the setup wizard.
 * When enabled, it monitors context usage and triggers automatic wrap-up.
 */
export default {
  name: "context-threshold",
  description: "Auto-trigger /wrap_up when context exceeds 80%",
  version: "1.0.0",
  /** This extension can be disabled by the user */
  allowDisable: true,
  piExtension,
} satisfies OtterAssistExtension;
