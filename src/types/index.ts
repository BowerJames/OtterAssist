/**
 * Core event structure for the event queue
 */
export interface Event {
  id: string;
  message: string;
  progress: string;
  createdAt: Date;
  status: "pending" | "completed";
}

/**
 * Main application configuration
 */
export interface Config {
  pollIntervalSeconds: number;
  extensions: {
    [extensionName: string]: {
      enabled: boolean;
      config?: Record<string, unknown>;
    };
  };
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Simple event emitter for extension communication
 */
export type EventHandler = (...args: unknown[]) => void;

export interface EventEmitter {
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  emit(event: string, ...args: unknown[]): void;
}

/**
 * JSON Schema type for extension configuration
 */
export type TSchema = Record<string, unknown>;

// ============================================================================
// LEGACY EXTENSION TYPES (deprecated, but maintained for backward compatibility)
// ============================================================================

/**
 * Context provided to extensions during initialization
 * @deprecated Use OAExtensionContext instead
 */
export interface ExtensionContext {
  configDir: string;
  logger: Logger;
  events: EventEmitter;
}

/**
 * Extension that produces events for the queue
 * @deprecated Use OtterAssistExtension instead
 *
 * This is the legacy extension format. New extensions should use
 * OtterAssistExtension which supports both event sources and pi extensions.
 */
export interface EventSourceExtension {
  name: string;
  description: string;
  configSchema?: TSchema;
  defaultConfig?: unknown;
  initialize?(config: unknown, context: ExtensionContext): Promise<void>;
  shutdown?(): Promise<void>;
  /** Returns messages to add to the event queue */
  poll(): Promise<string[]>;
}

// ============================================================================
// NEW EXTENSION TYPES (Issue #23)
// ============================================================================

/**
 * Context provided to OtterAssist extension event sources during initialization.
 *
 * This context provides extensions with access to OtterAssist internals
 * needed for event sourcing.
 *
 * @example
 * ```typescript
 * async initialize(context) {
 *   context.logger.info("Extension starting...");
 *   // extensionDir points to the extension's directory for config storage
 *   const configFile = join(context.extensionDir, "config.json");
 * }
 * ```
 */
export interface OAExtensionContext {
  /** Path to the OtterAssist config directory (~/.otterassist/) */
  configDir: string;
  /** Path to this extension's directory (for config storage) */
  extensionDir: string;
  /** Prefixed logger for the extension (messages include extension name) */
  logger: Logger;
}

/**
 * Event source definition - produces events for the queue.
 *
 * Event sources are polled by the scheduler on a configured interval.
 * Each poll returns messages that get added to the event queue and
 * eventually processed by the orchestrator as user messages to the pi agent.
 *
 * @example
 * ```typescript
 * const myEventSource: EventSourceDefinition = {
 *   async poll() {
 *     const newItems = await checkForNewItems();
 *     return newItems.map(item => `New item detected: ${item.name}`);
 *   },
 *   async initialize(context) {
 *     context.logger.info("Connecting to data source...");
 *     // Load config from context.extensionDir, setup connections, etc.
 *   },
 *   async shutdown() {
 *     // Cleanup resources
 *   }
 * };
 * ```
 */
export interface EventSourceDefinition {
  /**
   * Poll for new events.
   * Called by the scheduler on each tick.
   * Returns messages to add to the event queue.
   *
   * Messages should be descriptive and tell the agent what happened
   * and what action to take. They become user messages in the pi agent.
   */
  poll(): Promise<string[]>;

  /**
   * Called once when the extension is loaded and enabled.
   * Use this to setup connections, load state, etc.
   * Extensions are responsible for loading their own config from extensionDir.
   *
   * @param context - OtterAssist context (logger, extension dir, etc.)
   */
  initialize?(context: OAExtensionContext): Promise<void>;

  /**
   * Called once when OtterAssist shuts down.
   * Use this to cleanup resources, close connections, etc.
   */
  shutdown?(): Promise<void>;
}

/**
 * Pi extension function type.
 *
 * This is the same function signature used by pi extensions.
 * It receives the ExtensionAPI and can register tools, skills, hooks, commands, etc.
 *
 * For proper type safety, import ExtensionAPI from pi:
 * ```typescript
 * import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
 * ```
 *
 * @see https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
 */
export type PiExtensionFunction = (
  pi: import("@mariozechner/pi-coding-agent").ExtensionAPI,
) => void;

/**
 * Context provided to extension configure method.
 *
 * Extensions use this context to build their configuration TUI.
 * The extension is responsible for reading/writing its own config
 * from the extensionDir.
 *
 * @example
 * ```typescript
 * async configure(context: ExtensionConfigureContext) {
 *   const config = await loadConfig(context.extensionDir);
 *   // Build TUI, let user edit config
 *   // On save: await saveConfig(context.extensionDir, newConfig);
 *   return saved;
 * }
 * ```
 */
export interface ExtensionConfigureContext {
  /** Path to this extension's directory (for config storage) */
  extensionDir: string;
  /** Prefixed logger for the extension */
  logger: Logger;
  /** TUI instance for building config UI */
  tui: import("@mariozechner/pi-tui").TUI;
  /** Theme for consistent styling (matches wizard theme) */
  theme: {
    accent: (s: string) => string;
    text: (s: string) => string;
    muted: (s: string) => string;
    dim: (s: string) => string;
    success: (s: string) => string;
    error: (s: string) => string;
    bold: (s: string) => string;
  };
}

/**
 * OtterAssist Extension - bundles event sources with pi capabilities.
 *
 * Extensions can provide:
 * - Event sources: System triggers that produce events (OtterAssist-specific)
 * - Pi extension: Tools, skills, hooks, commands for the embedded agent
 *
 * The event source defines "what happened", the pi extension defines
 * "how to handle it". This allows extensions to be self-contained:
 * they detect events AND provide the capabilities to handle them.
 *
 * @example
 * ```typescript
 * // ~/.otterassist/extensions/messaging.ts
 * import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
 * import type { OtterAssistExtension } from "otterassist";
 *
 * export default {
 *   name: "messaging",
 *   description: "Handle messages from the shared inbox database",
 *
 *   // Event source: detects new messages
 *   events: {
 *     async poll() {
 *       const unread = await db.query("SELECT * FROM messages WHERE status = 'unread'");
 *       return unread.map(msg => `New message from ${msg.sender}: ${msg.subject}`);
 *     }
 *   },
 *
 *   // Pi extension: provides skill to handle messages
 *   piExtension(pi: ExtensionAPI) {
 *     pi.registerSkill?.({
 *       name: "messaging",
 *       description: "How to connect to and use the messaging database",
 *       content: "# Messaging System\n\n..."
 *     });
 *
 *     pi.registerTool({
 *       name: "send_reply",
 *       // ...
 *     });
 *   }
 * } satisfies OtterAssistExtension;
 * ```
 */
export interface OtterAssistExtension {
  /** Unique identifier for the extension (lowercase, hyphens allowed) */
  name: string;

  /** Human-readable description of what the extension does */
  description: string;

  /** Optional version string (semver recommended) */
  version?: string;

  /** Optional JSON schema for validating extension configuration */
  configSchema?: TSchema;

  /** Optional default configuration values */
  defaultConfig?: unknown;

  /**
   * Whether this extension can be disabled by the user.
   * Built-in extensions can set this to false to enforce always-on behavior.
   * User-installed extensions default to true (can be disabled).
   * @default true
   */
  allowDisable?: boolean;

  /**
   * Whether this is a built-in extension (ships with OtterAssist).
   * This is set automatically for built-in extensions.
   * @internal
   */
  isBuiltin?: boolean;

  /**
   * Event source: produces events for the queue.
   * Events become user messages to the pi agent.
   */
  events?: EventSourceDefinition;

  /**
   * Pi extension: provides capabilities to handle events.
   *
   * This function is called with the pi ExtensionAPI when the
   * embedded agent is initialized. It can register:
   * - Tools (pi.registerTool)
   * - Skills (pi.registerSkill)
   * - Hooks (pi.on)
   * - Commands (pi.registerCommand)
   * - And more
   *
   * Import ExtensionAPI from "@mariozechner/pi-coding-agent"
   */
  piExtension?: PiExtensionFunction;

  /**
   * Initialize the extension.
   *
   * Called once when the extension is loaded and enabled.
   * Use this to load configuration, setup connections, etc.
   *
   * For extensions with events, use events.initialize instead.
   * This method is for pi-only extensions that need initialization.
   *
   * @param context - OtterAssist context (logger, extension dir, etc.)
   */
  initialize?(context: OAExtensionContext): Promise<void>;

  /**
   * Configuration UI: allows users to configure this extension.
   *
   * When provided, users can run `otterassist extension configure <name>`
   * to launch a TUI for configuring the extension.
   *
   * Only directory-based extensions can be configurable.
   * Single-file extensions cannot have a configure method.
   *
   * The extension is responsible for:
   * - Reading its config from context.extensionDir
   * - Building the TUI interface
   * - Writing config back to context.extensionDir
   *
   * @param context - Configuration context with TUI and extension directory
   * @returns true if config was saved, false if cancelled
   */
  configure?(context: ExtensionConfigureContext): Promise<boolean>;
}

// ============================================================================
// EVENT QUEUE INTERFACE
// ============================================================================

/**
 * Event queue interface
 */
export interface EventQueue {
  add(message: string): Promise<Event>;
  getPending(): Promise<Event[]>;
  getById(id: string): Promise<Event | null>;
  updateProgress(id: string, progress: string): Promise<void>;
  markComplete(id: string): Promise<void>;
  purgeCompleted(olderThan: Date): Promise<number>;
  close(): void;
}
