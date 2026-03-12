/**
 * Setup Wizard - Interactive TUI for configuring OtterAssist
 * @see Issue #8
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type Component, ProcessTerminal, TUI } from "@mariozechner/pi-tui";
import {
  CONFIG_DIR,
  CONFIG_PATH,
  loadConfig,
  saveConfig,
} from "../config/loader.ts";
import {
  discoverExtensions,
  getBuiltinExtensions,
  loadExtension,
} from "../extensions/index.ts";
import type { Config } from "../types/index.ts";
import { createExtensionsScreen } from "./screens/extensions.ts";
import { createPollIntervalScreen } from "./screens/poll-interval.ts";
import { createReviewScreen } from "./screens/review.ts";
import { createWelcomeScreen } from "./screens/welcome.ts";

/**
 * Discovered extension info for the wizard
 */
export interface ExtensionInfo {
  name: string;
  description: string;
  path: string;
  /** Whether this extension can be disabled by the user */
  allowDisable: boolean;
  /** Whether this is a built-in extension */
  isBuiltin: boolean;
}

/**
 * Wizard state passed between screens
 */
export interface WizardState {
  pollIntervalSeconds: number;
  extensions: Map<string, { enabled: boolean; info: ExtensionInfo }>;
}

/**
 * Screen result - either continue to next screen or go back
 */
export type ScreenResult = "next" | "back" | "done" | "cancel";

/**
 * Screen component interface
 */
export interface ScreenComponent extends Component {
  onResult?: (result: ScreenResult) => void | Promise<void>;
}

/**
 * Screen factory function type
 */
export type ScreenFactory = (
  tui: TUI,
  theme: WizardTheme,
  state: WizardState,
) => ScreenComponent;

/**
 * Theme colors for the wizard
 */
export interface WizardTheme {
  accent: (s: string) => string;
  text: (s: string) => string;
  muted: (s: string) => string;
  dim: (s: string) => string;
  success: (s: string) => string;
  error: (s: string) => string;
  bold: (s: string) => string;
}

/**
 * Default theme using ANSI colors
 */
export const defaultTheme: WizardTheme = {
  accent: (s) => `\x1b[36m${s}\x1b[0m`, // cyan
  text: (s) => `\x1b[37m${s}\x1b[0m`, // white
  muted: (s) => `\x1b[90m${s}\x1b[0m`, // bright black
  dim: (s) => `\x1b[2m${s}\x1b[0m`, // dim
  success: (s) => `\x1b[32m${s}\x1b[0m`, // green
  error: (s) => `\x1b[31m${s}\x1b[0m`, // red
  bold: (s) => `\x1b[1m${s}\x1b[0m`, // bold
};

/**
 * Setup Wizard class
 */
export class SetupWizard {
  private tui: TUI;
  private terminal: ProcessTerminal;
  private theme: WizardTheme;
  private state: WizardState;
  private extensions: ExtensionInfo[];
  private currentScreenIndex = 0;
  private screens: ScreenFactory[] = [];
  private saved = false;

  constructor(extensions: ExtensionInfo[], existingConfig?: Config) {
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal);
    this.theme = defaultTheme;
    this.extensions = extensions;

    // Initialize state from existing config or defaults
    this.state = this.initState(existingConfig);

    // Define screens in order
    this.screens = [
      createWelcomeScreen,
      createPollIntervalScreen,
      (_tui, _theme, state) =>
        createExtensionsScreen(_tui, _theme, state, this.extensions),
      createReviewScreen,
    ];
  }

  private initState(existingConfig?: Config): WizardState {
    const extensionsMap = new Map<
      string,
      { enabled: boolean; info: ExtensionInfo }
    >();

    // Add all discovered extensions
    for (const info of this.extensions) {
      const existing = existingConfig?.extensions?.[info.name];
      extensionsMap.set(info.name, {
        enabled: existing?.enabled ?? false,
        info,
      });
    }

    return {
      pollIntervalSeconds: existingConfig?.pollIntervalSeconds ?? 300,
      extensions: extensionsMap,
    };
  }

  /**
   * Run the wizard
   * @returns true if config was saved, false if cancelled
   */
  async run(): Promise<boolean> {
    return new Promise((resolve) => {
      this.saved = false;

      const cleanup = () => {
        this.tui.stop();
        resolve(this.saved);
      };

      const showScreen = (index: number) => {
        if (index < 0 || index >= this.screens.length) {
          cleanup();
          return;
        }

        this.currentScreenIndex = index;
        const factory = this.screens[index];
        if (!factory) {
          cleanup();
          return;
        }
        const screen = factory(this.tui, this.theme, this.state);

        // Set up result handler
        screen.onResult = async (result: ScreenResult) => {
          switch (result) {
            case "next":
              if (this.currentScreenIndex === this.screens.length - 1) {
                // Last screen - save and exit
                await this.saveConfig();
                this.saved = true;
                cleanup();
              } else {
                showScreen(this.currentScreenIndex + 1);
              }
              break;
            case "back":
              showScreen(this.currentScreenIndex - 1);
              break;
            case "done":
              await this.saveConfig();
              this.saved = true;
              cleanup();
              break;
            case "cancel":
              cleanup();
              break;
          }
        };

        // Clear TUI children and add new screen
        this.tui.clear();
        this.tui.addChild(screen);
        this.tui.setFocus(screen);
        this.tui.requestRender();
      };

      this.tui.start();
      showScreen(0);
    });
  }

  private async saveConfig(): Promise<void> {
    const config: Config = {
      pollIntervalSeconds: this.state.pollIntervalSeconds,
      extensions: {},
    };

    for (const [name, { enabled }] of this.state.extensions) {
      config.extensions[name] = { enabled };
    }

    // Ensure directories exist
    await mkdir(CONFIG_DIR, { recursive: true });
    await mkdir(join(CONFIG_DIR, "agent"), { recursive: true });
    await mkdir(join(CONFIG_DIR, "extensions"), { recursive: true });

    await saveConfig(config);
  }
}

/**
 * Run the setup wizard
 * @param extensions Discovered extensions
 * @param existingConfig Optional existing config to edit
 * @returns true if config was saved, false if cancelled
 */
export async function runSetupWizard(
  extensions: ExtensionInfo[],
  existingConfig?: Config,
): Promise<boolean> {
  const wizard = new SetupWizard(extensions, existingConfig);
  return wizard.run();
}

/**
 * Check if this is first run (no config exists)
 * @param configPath - Optional custom config file path
 */
export async function isFirstRun(configPath?: string): Promise<boolean> {
  const filePath = configPath ?? CONFIG_PATH;
  const file = Bun.file(filePath);
  return !(await file.exists());
}

/**
 * Discover and load extension info for the wizard
 * Includes both built-in and user-installed extensions.
 * @returns Array of extension info objects
 */
export async function discoverExtensionInfo(): Promise<ExtensionInfo[]> {
  const infos: ExtensionInfo[] = [];

  // Add built-in extensions first
  const builtins = getBuiltinExtensions();
  for (const ext of builtins) {
    infos.push({
      name: ext.name,
      description: ext.description,
      path: "(built-in)",
      allowDisable: ext.allowDisable,
      isBuiltin: true,
    });
  }

  // Then add user-installed extensions from filesystem
  const extensionPaths = await discoverExtensions();

  for (const path of extensionPaths) {
    try {
      const ext = await loadExtension(path);

      // Skip if already in list (built-in takes precedence)
      if (infos.some((info) => info.name === ext.name)) {
        continue;
      }

      infos.push({
        name: ext.name,
        description: ext.description,
        path,
        allowDisable: ext.allowDisable,
        isBuiltin: ext.isBuiltin,
      });
    } catch (error) {
      // Skip extensions that fail to load
      console.warn(`Failed to load extension from ${path}:`, error);
    }
  }

  return infos;
}

/**
 * Run setup if first run, or if forced
 */
export async function runSetupIfNeeded(
  extensions: ExtensionInfo[],
  force = false,
): Promise<Config | null> {
  const firstRun = await isFirstRun();

  if (firstRun || force) {
    const existingConfig = firstRun
      ? undefined
      : await loadConfig().catch(() => undefined);
    const saved = await runSetupWizard(extensions, existingConfig);

    if (saved) {
      return loadConfig();
    }
    return null;
  }

  return loadConfig();
}
