/**
 * Context Threshold - Built-in extension that auto-triggers wrap-up
 *
 * Monitors context usage after each turn and automatically queues
 * the /wrap_up command when context exceeds the threshold (default 80%).
 *
 * Configuration is stored in ~/.otterassist/builtins/context-threshold/config.json
 *
 * @see Issue #39 (extension configuration support)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import type {
  ExtensionConfigureContext,
  OAExtensionContext,
  OtterAssistExtension,
} from "../../types/index.ts";
import { wrapUpState } from "./wrap-up-manager.ts";

/**
 * Configuration for the context-threshold extension
 */
interface ContextThresholdConfig {
  /** Threshold as a decimal (0.0 - 1.0), e.g., 0.8 = 80% */
  threshold: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ContextThresholdConfig = {
  threshold: 0.8,
};

/**
 * Current loaded configuration (cached in memory)
 */
let currentConfig: ContextThresholdConfig = { ...DEFAULT_CONFIG };

/**
 * Load configuration from the extension directory.
 */
async function loadConfig(extensionDir: string): Promise<ContextThresholdConfig> {
  try {
    const configFile = Bun.file(join(extensionDir, "config.json"));
    if (await configFile.exists()) {
      const loaded = await configFile.json();
      // Validate and merge with defaults
      const config: ContextThresholdConfig = {
        threshold:
          typeof loaded.threshold === "number" &&
          loaded.threshold > 0 &&
          loaded.threshold <= 1
            ? loaded.threshold
            : DEFAULT_CONFIG.threshold,
      };
      return config;
    }
  } catch {
    // Ignore errors, use defaults
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save configuration to the extension directory.
 */
async function saveConfig(
  extensionDir: string,
  config: ContextThresholdConfig,
): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(extensionDir, { recursive: true });
  await Bun.write(
    join(extensionDir, "config.json"),
    JSON.stringify(config, null, 2),
  );
}

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

    const thresholdPercent = currentConfig.threshold * 100;

    // Check if threshold exceeded
    if (usage.percent >= thresholdPercent) {
      // Set the flag to prevent duplicate wrap-ups
      wrapUpState.queued = true;

      // Notify user if UI is available
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Context at ${usage.percent.toFixed(1)}% (threshold: ${thresholdPercent.toFixed(0)}%). Queuing /wrap_up...`,
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
  description: "Auto-trigger /wrap_up when context exceeds threshold",
  version: "1.0.0",
  /** This extension can be disabled by the user */
  allowDisable: true,

  /**
   * Initialize the extension - load configuration
   */
  async initialize(context: OAExtensionContext): Promise<void> {
    currentConfig = await loadConfig(context.extensionDir);
    context.logger.info(
      `Loaded config, threshold: ${(currentConfig.threshold * 100).toFixed(0)}%`,
    );
  },

  /**
   * Configuration UI - allow user to set the threshold
   */
  async configure(context: ExtensionConfigureContext): Promise<boolean> {
    const {
      Container,
      SettingsList,
      Text,
      Key,
      matchesKey,
    } = await import("@mariozechner/pi-tui");
    const { mkdir } = await import("node:fs/promises");

    // Load current config
    const config = await loadConfig(context.extensionDir);

    return new Promise((resolve) => {
      // Available threshold options
      const thresholdOptions = [
        { value: 0.5, label: "50%" },
        { value: 0.6, label: "60%" },
        { value: 0.7, label: "70%" },
        { value: 0.8, label: "80%" },
        { value: 0.85, label: "85%" },
        { value: 0.9, label: "90%" },
        { value: 0.95, label: "95%" },
      ];

      // Find current selection index
      let currentIndex = thresholdOptions.findIndex(
        (opt) => opt.value === config.threshold,
      );
      if (currentIndex === -1) currentIndex = 3; // Default to 80%

      // Build settings items
      const items = [
        {
          id: "threshold",
          label: "Context Threshold",
          currentValue: thresholdOptions[currentIndex]?.label ?? "80%",
          values: thresholdOptions.map((o) => o.label),
        },
      ];

      let saved = false;

      class ConfigScreen extends Container {
        private settingsList: InstanceType<typeof SettingsList>;

        constructor() {
          super();

          this.settingsList = new SettingsList(
            items,
            5,
            {
              label: (s: string, selected: boolean) =>
                selected
                  ? context.theme.accent(context.theme.bold(s))
                  : context.theme.text(s),
              value: (s: string, selected: boolean) =>
                selected ? context.theme.accent(s) : context.theme.muted(s),
              description: (s: string) => context.theme.dim(s),
              cursor: ">",
              hint: (s: string) => context.theme.dim(s),
            },
            async (id: string, newValue: string) => {
              if (id === "threshold") {
                const option = thresholdOptions.find(
                  (o) => o.label === newValue,
                );
                if (option) {
                  config.threshold = option.value;
                }
              }
            },
            async () => {
              // Enter pressed - save and exit
              await mkdir(context.extensionDir, { recursive: true });
              await saveConfig(context.extensionDir, config);
              currentConfig = config;
              saved = true;
              context.tui.stop();
              resolve(true);
            },
          );

          this.buildContent();
        }

        private buildContent(): void {
          this.addChild(new Text("", 0, 0));
          this.addChild(
            new Text(
              context.theme.accent(context.theme.bold("     ⚙️  Context Threshold")),
              0,
              0,
            ),
          );
          this.addChild(new Text("", 0, 0));
          this.addChild(
            new Text(
              context.theme.text(
                "     Set the context usage percentage that triggers",
              ),
              0,
              0,
            ),
          );
          this.addChild(
            new Text(
              context.theme.text(
                "     automatic /wrap_up to free up context.",
              ),
              0,
              0,
            ),
          );
          this.addChild(new Text("", 0, 0));
          this.addChild(this.settingsList);
          this.addChild(new Text("", 0, 0));
          this.addChild(
            new Text(
              context.theme.dim(
                "     ←/→ to change, Enter to save, Escape to cancel",
              ),
              0,
              0,
            ),
          );
        }

        handleInput(data: string): void {
          if (matchesKey(data, Key.escape)) {
            context.tui.stop();
            resolve(false);
          } else {
            this.settingsList.handleInput(data);
          }
        }
      }

      context.tui.addChild(new ConfigScreen());
      context.tui.start();
    });
  },

  piExtension,
} satisfies OtterAssistExtension;
