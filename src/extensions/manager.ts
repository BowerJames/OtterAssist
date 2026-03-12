/**
 * Extension manager - handles lifecycle of OtterAssist extensions
 * @see Issue #4 (original event source extensions)
 * @see Issue #23 (enhanced extension system with pi integration)
 * @see Issue #37 (built-in extensions for wrap-up coordination)
 * @see Issue #39 (extension configuration support)
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { CONFIG_DIR } from "../config/loader.ts";
import type { Config, Logger, OAExtensionContext } from "../types/index.ts";
import {
  discoverExtensions,
  getBuiltinExtensions,
  type LoadedExtension,
  loadExtension,
} from "./loader.ts";

/**
 * Manages the lifecycle of OtterAssist extensions.
 *
 * Handles:
 * - Discovery and loading of extensions from disk
 * - Loading of built-in extensions (always available)
 * - Lifecycle management (initialize, poll, shutdown)
 * - Separation of event sources and pi extensions
 */
export class ExtensionManager {
  /** All loaded extensions (indexed by name) */
  private readonly extensions: Map<string, LoadedExtension> = new Map();

  /** Pi extension factories collected from all extensions */
  private readonly piExtensions: ExtensionFactory[] = [];

  private readonly logger: Logger;
  private readonly config: Config;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Discovers, loads, filters, and initializes all extensions.
   *
   * Loading order:
   * 1. Built-in extensions with allowDisable: false (always loaded)
   * 2. Built-in extensions with allowDisable: true (check config)
   * 3. User-installed extensions from filesystem (check config)
   *
   * For each enabled extension:
   * 1. Loads the extension module
   * 2. Initializes the event source (if present)
   * 3. Collects pi extension function (if present)
   */
  async loadAll(): Promise<void> {
    this.logger.info("Loading extensions...");

    // Load built-in extensions first
    await this.loadBuiltinExtensions();

    // Then load user-installed extensions from filesystem
    await this.loadUserExtensions();

    this.logger.info(
      `Loaded ${this.extensions.size} extension(s), ${this.piExtensions.length} with pi integration`,
    );
  }

  /**
   * Loads built-in extensions that ship with OtterAssist.
   */
  private async loadBuiltinExtensions(): Promise<void> {
    const builtins = getBuiltinExtensions();
    this.logger.debug(`Found ${builtins.length} built-in extension(s)`);

    for (const extension of builtins) {
      const extensionName = extension.name;

      // Required extensions are always loaded
      if (!extension.allowDisable) {
        this.logger.debug(
          `Loading required built-in extension: ${extensionName}`,
        );
        await this.registerExtension(extension);
        continue;
      }

      // Optional built-ins check config like user extensions
      const extensionConfig = this.config.extensions[extensionName];
      if (!extensionConfig?.enabled) {
        this.logger.debug(
          `Built-in extension "${extensionName}" is disabled, skipping`,
        );
        continue;
      }

      await this.registerExtension(extension);
    }
  }

  /**
   * Loads user-installed extensions from the filesystem.
   */
  private async loadUserExtensions(): Promise<void> {
    const discoveredExtensions = await discoverExtensions();
    this.logger.debug(`Found ${discoveredExtensions.length} user extension(s)`);

    for (const discovered of discoveredExtensions) {
      try {
        const extension = await loadExtension(discovered);
        const extensionName = extension.name;

        // Skip if already loaded (built-in takes precedence)
        if (this.extensions.has(extensionName)) {
          this.logger.debug(
            `Extension "${extensionName}" already loaded (built-in), skipping user version`,
          );
          continue;
        }

        // Check if extension is enabled in config
        const extensionConfig = this.config.extensions[extensionName];
        if (!extensionConfig?.enabled) {
          this.logger.debug(
            `Extension "${extensionName}" is disabled, skipping`,
          );
          continue;
        }

        // Log format warning for legacy extensions
        if (extension.isLegacy) {
          this.logger.debug(
            `Extension "${extensionName}" uses legacy format. ` +
              "Consider upgrading to OtterAssistExtension for pi integration.",
          );
        }

        await this.registerExtension(extension);
      } catch (error) {
        this.logger.error(`Failed to load extension from ${discovered.entryPath}:`, error);
      }
    }
  }

  /**
   * Registers an extension (initializes event source, collects pi extension).
   */
  private async registerExtension(extension: LoadedExtension): Promise<void> {
    const extensionName = extension.name;

    // Build the context for initialization
    const context: OAExtensionContext = {
      configDir: CONFIG_DIR,
      extensionDir: extension.extensionDir,
      logger: this.createExtensionLogger(extensionName),
    };

    // Initialize the event source if present
    if (extension.events?.initialize) {
      await extension.events.initialize(context);
    }

    // Initialize the extension (top-level) if present (for pi-only extensions)
    if (extension.initialize) {
      await extension.initialize(context);
    }

    // Store the extension
    this.extensions.set(extensionName, extension);

    // Collect pi extension function if present
    if (extension.piExtension) {
      this.piExtensions.push(extension.piExtension);
      this.logger.debug(`Extension "${extensionName}" registered pi extension`);
    }

    // Log loaded extension
    const hasEvents = extension.events ? "events" : "";
    const hasPi = extension.piExtension ? "pi" : "";
    const hasConfig = extension.configure ? "config" : "";
    const capabilities = [hasEvents, hasPi, hasConfig].filter(Boolean).join("+");
    const version = extension.version ? ` v${extension.version}` : "";
    const builtin = extension.isBuiltin ? " [built-in]" : "";

    this.logger.info(
      `Loaded extension: ${extensionName}${version}${builtin} - ${extension.description} [${capabilities || "empty"}]`,
    );
  }

  /**
   * Polls all extensions with event sources and returns collected messages.
   */
  async pollAll(): Promise<string[]> {
    const messages: string[] = [];

    for (const [name, extension] of this.extensions) {
      // Skip extensions without event sources
      if (!extension.events) {
        continue;
      }

      try {
        this.logger.debug(`Polling extension: ${name}`);
        const newMessages = await extension.events.poll();

        if (newMessages.length > 0) {
          this.logger.info(
            `Extension "${name}" returned ${newMessages.length} event(s)`,
          );
          messages.push(...newMessages);
        }
      } catch (error) {
        this.logger.error(`Error polling extension "${name}":`, error);
      }
    }

    return messages;
  }

  /**
   * Shuts down all extensions with event sources.
   */
  async shutdownAll(): Promise<void> {
    this.logger.info("Shutting down extensions...");

    for (const [name, extension] of this.extensions) {
      if (extension.events?.shutdown) {
        try {
          await extension.events.shutdown();
          this.logger.debug(`Extension "${name}" shut down`);
        } catch (error) {
          this.logger.error(`Error shutting down extension "${name}":`, error);
        }
      }
    }

    this.extensions.clear();
    this.piExtensions.length = 0;
    this.logger.info("All extensions shut down");
  }

  /**
   * Gets a loaded extension by name.
   */
  get(name: string): LoadedExtension | undefined {
    return this.extensions.get(name);
  }

  /**
   * Gets all loaded extension names.
   */
  getLoadedNames(): string[] {
    return [...this.extensions.keys()];
  }

  /**
   * Gets all pi extension factories from loaded extensions.
   *
   * These factories should be passed to the AgentRunner to register
   * tools, skills, hooks, etc. with the embedded pi agent.
   *
   * @returns Array of pi extension factories
   */
  getPiExtensions(): ExtensionFactory[] {
    return [...this.piExtensions];
  }

  /**
   * Checks if any extensions have pi integration.
   */
  hasPiExtensions(): boolean {
    return this.piExtensions.length > 0;
  }

  /**
   * Creates a prefixed logger for an extension.
   */
  private createExtensionLogger(name: string): Logger {
    const parent = this.logger;
    const prefix = `[${name}]`;

    return {
      debug(message: string, ...args: unknown[]): void {
        parent.debug(`${prefix} ${message}`, ...args);
      },
      info(message: string, ...args: unknown[]): void {
        parent.info(`${prefix} ${message}`, ...args);
      },
      warn(message: string, ...args: unknown[]): void {
        parent.warn(`${prefix} ${message}`, ...args);
      },
      error(message: string, ...args: unknown[]): void {
        parent.error(`${prefix} ${message}`, ...args);
      },
    };
  }
}
