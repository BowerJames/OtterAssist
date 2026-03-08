import type { Logger } from "../types/index.ts";

/**
 * Log levels for the logger
 */
type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Simple logger implementation with configurable log level
 */
export class ConsoleLogger implements Logger {
  private readonly prefix: string;
  private readonly minLevel: LogLevel;

  constructor(prefix = "OtterAssist", minLevel: LogLevel = "info") {
    this.prefix = prefix;
    this.minLevel = minLevel;
  }

  private readonly levels: LogLevel[] = ["debug", "info", "warn", "error"];

  private shouldLog(level: LogLevel): boolean {
    return this.levels.indexOf(level) >= this.levels.indexOf(this.minLevel);
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message), ...args);
    }
  }
}

/**
 * Default logger instance
 */
export const logger = new ConsoleLogger();
