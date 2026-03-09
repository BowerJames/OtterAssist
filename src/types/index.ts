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
 * async initialize(config, context) {
 *   context.logger.info("Extension starting...");
 *   // configDir points to ~/.otterassist/
 *   const dataFile = join(context.configDir, "my-extension-data.json");
 * }
 * ```
 */
export interface OAExtensionContext {
  /** Path to the OtterAssist config directory (~/.otterassist/) */
  configDir: string;
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
 *   async initialize(config, context) {
 *     context.logger.info("Connecting to data source...");
 *     // Setup connections, state, etc.
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
   *
   * @param config - Extension-specific configuration from config file
   * @param context - OtterAssist context (logger, config dir, etc.)
   */
  initialize?(
    config: unknown,
    context: OAExtensionContext,
  ): Promise<void>;

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
 * Import ExtensionAPI from pi:
 * ```typescript
 * import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
 * ```
 *
 * For proper type safety, import ExtensionFactory directly from pi:
 * ```typescript
 * import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
 * ```
 *
 * @see https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
 */
export type PiExtensionFunction = (pi: unknown) => void;

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
