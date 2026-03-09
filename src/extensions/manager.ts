/**
 * Extension manager - handles lifecycle of event source extensions
 * @see Issue #4
 */

import { CONFIG_DIR } from "../config/loader.ts";
import { SimpleEventEmitter } from "../core/emitter.ts";
import type {
  Config,
  EventSourceExtension,
  ExtensionContext,
  Logger,
} from "../types/index.ts";
import { discoverExtensions, loadExtension } from "./loader.ts";

/**
 * Manages the lifecycle of event source extensions
 */
export class ExtensionManager {
  private readonly extensions: Map<string, EventSourceExtension> = new Map();
  private readonly logger: Logger;
  private readonly config: Config;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Discovers, loads, filters, and initializes all extensions
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

        // Initialize the extension if it has an initialize method
        if (extension.initialize) {
          const context: ExtensionContext = {
            configDir: CONFIG_DIR,
            logger: this.createExtensionLogger(extensionName),
            events: new SimpleEventEmitter(),
          };

          const config = extensionConfig.config ?? extension.defaultConfig;
          await extension.initialize(config, context);
        }

        this.extensions.set(extensionName, extension);
        this.logger.info(
          `Loaded extension: ${extensionName} - ${extension.description}`,
        );
      } catch (error) {
        this.logger.error(`Failed to load extension from ${path}:`, error);
      }
    }

    this.logger.info(`Loaded ${this.extensions.size} extension(s)`);
  }

  /**
   * Polls all enabled extensions and returns collected messages
   */
  async pollAll(): Promise<string[]> {
    const messages: string[] = [];

    for (const [name, extension] of this.extensions) {
      try {
        this.logger.debug(`Polling extension: ${name}`);
        const newMessages = await extension.poll();

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
   * Shuts down all extensions
   */
  async shutdownAll(): Promise<void> {
    this.logger.info("Shutting down extensions...");

    for (const [name, extension] of this.extensions) {
      if (extension.shutdown) {
        try {
          await extension.shutdown();
          this.logger.debug(`Extension "${name}" shut down`);
        } catch (error) {
          this.logger.error(`Error shutting down extension "${name}":`, error);
        }
      }
    }

    this.extensions.clear();
    this.logger.info("All extensions shut down");
  }

  /**
   * Gets a loaded extension by name
   */
  get(name: string): EventSourceExtension | undefined {
    return this.extensions.get(name);
  }

  /**
   * Gets all loaded extension names
   */
  getLoadedNames(): string[] {
    return [...this.extensions.keys()];
  }

  /**
   * Creates a prefixed logger for an extension
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
