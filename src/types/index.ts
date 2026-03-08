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
 * Context provided to extensions during initialization
 */
export interface ExtensionContext {
  configDir: string;
  logger: Logger;
  events: EventEmitter;
}

/**
 * JSON Schema type for extension configuration
 */
export type TSchema = Record<string, unknown>;

/**
 * Extension that produces events for the queue
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
}
