/**
 * Console logger implementation with configurable log levels.
 *
 * Provides structured logging with timestamps and log level filtering.
 * Used throughout OtterAssist for consistent logging output.
 *
 * @example
 * ```typescript
 * const logger = new ConsoleLogger("MyComponent", "debug");
 *
 * logger.debug("Detailed diagnostic info");  // Only shown at debug level
 * logger.info("Normal operation message");
 * logger.warn("Warning condition");
 * logger.error("Error occurred", new Error("Details"));
 * ```
 */
import type { Logger } from "../types/index.ts";

/** Log levels in order of severity */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Simple logger implementation with configurable log level.
 *
 * Output format:
 * `[timestamp] [prefix] [LEVEL] message [args...]`
 *
 * Log level filtering:
 * - debug: Show all messages
 * - info: Show info, warn, error
 * - warn: Show warn, error
 * - error: Show only error
 */
export class ConsoleLogger implements Logger {
  /** Prefix to include in all log messages */
  private readonly prefix: string;

  /** Minimum log level to output */
  private readonly minLevel: LogLevel;

  /** Ordered log levels for filtering */
  private readonly levels: LogLevel[] = ["debug", "info", "warn", "error"];

  /**
   * Create a new console logger.
   *
   * @param prefix - Prefix for all log messages (default: "OtterAssist")
   * @param minLevel - Minimum log level to output (default: "info")
   */
  constructor(prefix = "OtterAssist", minLevel: LogLevel = "info") {
    this.prefix = prefix;
    this.minLevel = minLevel;
  }

  /**
   * Check if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levels.indexOf(level) >= this.levels.indexOf(this.minLevel);
  }

  /**
   * Format a log message with timestamp and prefix.
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * Log a debug message (only shown when minLevel is "debug").
   *
   * Use for detailed diagnostic information during development.
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  /**
   * Log an info message.
   *
   * Use for normal operational messages.
   */
  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message), ...args);
    }
  }

  /**
   * Log a warning message.
   *
   * Use for potentially problematic conditions that aren't errors.
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  /**
   * Log an error message.
   *
   * Use for errors and exceptions.
   */
  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }
}

/**
 * Default logger instance for OtterAssist.
 *
 * Configured with "info" level by default.
 */
export const logger = new ConsoleLogger();
