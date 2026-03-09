/**
 * Scheduler - triggers polling on a configurable interval
 * @see Issue #5
 */

import type { ExtensionManager } from "../extensions/manager.ts";
import type { EventQueue, Logger } from "../types/index.ts";
import type { Orchestrator } from "./orchestrator.ts";

/**
 * Options for creating a Scheduler
 */
export interface SchedulerOptions {
  /** Polling interval in seconds */
  pollIntervalSeconds: number;
  /** Extension manager for polling event sources */
  extensionManager: ExtensionManager;
  /** Event queue for adding new events */
  eventQueue: EventQueue;
  /** Orchestrator for triggering agent runs */
  orchestrator: Orchestrator;
  /** Logger for debug/info output */
  logger: Logger;
}

/**
 * Status information about the scheduler
 */
export interface SchedulerStatus {
  /** Whether the scheduler is currently running */
  isRunning: boolean;
  /** Whether a tick is currently in progress */
  isTicking: boolean;
  /** Poll interval in seconds */
  pollIntervalSeconds: number;
  /** Timestamp of last tick (if any) */
  lastTickAt: Date | null;
  /** Number of ticks completed */
  tickCount: number;
}

/**
 * Scheduler that triggers extension polling and orchestrator checks on an interval.
 *
 * Responsibilities:
 * - Poll extensions at configured interval
 * - Add returned messages to event queue
 * - Trigger orchestrator to process events
 * - Handle graceful shutdown
 */
export class Scheduler {
  private readonly pollIntervalSeconds: number;
  private readonly extensionManager: ExtensionManager;
  private readonly eventQueue: EventQueue;
  private readonly orchestrator: Orchestrator;
  private readonly logger: Logger;

  /** Interval timer handle */
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Flag indicating if scheduler is running */
  private isRunning = false;

  /** Flag indicating if a tick is currently in progress */
  private isTicking = false;

  /** Promise that resolves when current tick completes */
  private currentTickPromise: Promise<void> | null = null;

  /** Timestamp of last completed tick */
  private lastTickAt: Date | null = null;

  /** Number of ticks completed */
  private tickCount = 0;

  constructor(options: SchedulerOptions) {
    this.pollIntervalSeconds = options.pollIntervalSeconds;
    this.extensionManager = options.extensionManager;
    this.eventQueue = options.eventQueue;
    this.orchestrator = options.orchestrator;
    this.logger = options.logger;
  }

  /**
   * Starts the scheduler.
   * Begins interval-based polling immediately.
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn("Scheduler already running");
      return;
    }

    this.isRunning = true;
    this.logger.info(
      `Scheduler starting with ${this.pollIntervalSeconds}s interval`,
    );

    // Run first tick immediately
    this.currentTickPromise = this.tick();

    // Set up interval for subsequent ticks
    this.intervalHandle = setInterval(() => {
      // Don't start a new tick if one is still in progress
      if (this.isTicking) {
        this.logger.debug("Skipping tick - previous tick still in progress");
        return;
      }
      this.currentTickPromise = this.tick();
    }, this.pollIntervalSeconds * 1000);
  }

  /**
   * Stops the scheduler.
   * Waits for any in-progress tick to complete before returning.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.debug("Scheduler not running");
      return;
    }

    this.logger.info("Scheduler stopping...");
    this.isRunning = false;

    // Clear the interval
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // Wait for current tick to complete if in progress
    if (this.currentTickPromise) {
      this.logger.debug("Waiting for current tick to complete...");
      await this.currentTickPromise;
    }

    this.logger.info(`Scheduler stopped (completed ${this.tickCount} ticks)`);
  }

  /**
   * Manually triggers a single tick.
   * Useful for --once mode or testing.
   */
  async triggerNow(): Promise<void> {
    this.logger.info("Manual tick triggered");
    await this.tick();
  }

  /**
   * Gets the current status of the scheduler
   */
  getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      isTicking: this.isTicking,
      pollIntervalSeconds: this.pollIntervalSeconds,
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
    };
  }

  /**
   * Checks if the scheduler is currently running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Checks if a tick is currently in progress
   */
  getIsTicking(): boolean {
    return this.isTicking;
  }

  /**
   * Performs a single tick:
   * 1. Poll all extensions
   * 2. Add messages to event queue
   * 3. Trigger orchestrator
   */
  private async tick(): Promise<void> {
    if (this.isTicking) {
      this.logger.debug("Tick already in progress, skipping");
      return;
    }

    this.isTicking = true;
    const tickStart = new Date();

    this.logger.debug(`Tick #${this.tickCount + 1} starting`);

    try {
      // 1. Poll all extensions
      const messages = await this.pollExtensions();

      // 2. Add messages to event queue
      await this.addEventsToQueue(messages);

      // 3. Trigger orchestrator to process events
      await this.orchestrator.checkAndRun();

      // Update stats
      this.tickCount++;
      this.lastTickAt = new Date();

      const durationMs = this.lastTickAt.getTime() - tickStart.getTime();
      this.logger.debug(`Tick #${this.tickCount} completed in ${durationMs}ms`);
    } catch (error) {
      this.logger.error("Tick failed with error:", error);
      // Don't rethrow - scheduler should continue running
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Polls all extensions and returns collected messages
   */
  private async pollExtensions(): Promise<string[]> {
    try {
      return await this.extensionManager.pollAll();
    } catch (error) {
      this.logger.error("Error polling extensions:", error);
      return [];
    }
  }

  /**
   * Adds messages to the event queue
   */
  private async addEventsToQueue(messages: string[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    this.logger.info(`Adding ${messages.length} event(s) to queue`);

    for (const message of messages) {
      try {
        await this.eventQueue.add(message);
      } catch (error) {
        this.logger.error("Failed to add event to queue:", error);
      }
    }
  }
}
