/**
 * Extension manager - handles lifecycle of OtterAssist extensions
 * @see Issue #4 (original event source extensions)
 * @see Issue #23 (enhanced extension system with pi integration)
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { CONFIG_DIR } from "../config/loader.ts";
import type { Config, Logger, OAExtensionContext } from "../types/index.ts";
import {
  type LoadedExtension,
  discoverExtensions,
  loadExtension,
} from "./loader.ts";

/**
 * Manages the lifecycle of OtterAssist extensions.
 *
 * Handles:
 * - Discovery and loading of extensions from disk
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
   * For each enabled extension:
   * 1. Loads the extension module
   * 2. Initializes the event source (if present)
   * 3. Collects pi extension function (if present)
   */
  async loadAll(): Promise<void> {
    this.logger.info("Discovering extensions...");

    const extensionPaths = await discoverExtensions();
    this.logger.info(`Found ${extensionPaths.length} extension(s)`);

    for (const path of extensionPaths) {
      try {
        const extension = await loadExtension(path);
        const extensionName = extension.name;

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

        // Initialize the event source if present
        if (extension.events?.initialize) {
          const context: OAExtensionContext = {
            configDir: CONFIG_DIR,
            logger: this.createExtensionLogger(extensionName),
          };

          const config = extensionConfig.config ?? extension.defaultConfig;
          await extension.events.initialize(config, context);
        }

        // Store the extension
        this.extensions.set(extensionName, extension);

        // Collect pi extension function if present
        if (extension.piExtension) {
          this.piExtensions.push(extension.piExtension);
          this.logger.debug(
            `Extension "${extensionName}" registered pi extension`,
          );
        }

        // Log loaded extension
        const hasEvents = extension.events ? "events" : "";
        const hasPi = extension.piExtension ? "pi" : "";
        const capabilities = [hasEvents, hasPi].filter(Boolean).join("+");
        const version = extension.version ? ` v${extension.version}` : "";

        this.logger.info(
          `Loaded extension: ${extensionName}${version} - ${extension.description} [${capabilities || "empty"}]`,
        );
      } catch (error) {
        this.logger.error(`Failed to load extension from ${path}:`, error);
      }
    }

    this.logger.info(
      `Loaded ${this.extensions.size} extension(s), ${this.piExtensions.length} with pi integration`,
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
