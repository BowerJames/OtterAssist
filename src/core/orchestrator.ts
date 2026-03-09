/**
 * Agent Orchestrator - manages agent runs, ensures only one at a time
 * @see Issue #6
 */

import { randomUUID } from "node:crypto";
import type { EventQueue, Logger } from "../types/index.ts";
import type { AgentRunResult, Runner } from "./runner.ts";

/**
 * Options for creating an Orchestrator
 */
export interface OrchestratorOptions {
  /** Event queue for checking pending events */
  eventQueue: EventQueue;
  /** Agent runner for processing events */
  agentRunner: Runner;
  /** Logger for debug/info output */
  logger: Logger;
}

/**
 * Status information about the orchestrator
 */
export interface OrchestratorStatus {
  /** Whether an agent run is currently in progress */
  isRunning: boolean;
  /** ID of the current run (if running) */
  currentRunId: string | null;
  /** Number of pending events in the queue */
  pendingEventCount: number;
}

/**
 * Result of a checkAndRun call
 */
export interface OrchestratorRunResult {
  /** Whether an agent run was started */
  started: boolean;
  /** Reason if not started */
  skipReason?: "already_running" | "no_events";
  /** Result from the agent runner (if run was started) */
  agentResult?: AgentRunResult;
  /** Run ID (if run was started) */
  runId?: string;
}

/**
 * Orchestrator that manages agent runs, ensuring only one runs at a time.
 *
 * Responsibilities:
 * - Prevent concurrent agent runs
 * - Only start agent when pending events exist
 * - Track run state for monitoring
 * - Handle failures gracefully (events stay pending)
 */
export class Orchestrator {
  private readonly eventQueue: EventQueue;
  private readonly agentRunner: Runner;
  private readonly logger: Logger;

  /** Lock to prevent concurrent runs */
  private isRunning = false;

  /** Current run ID for logging/tracking */
  private currentRunId: string | null = null;

  constructor(options: OrchestratorOptions) {
    this.eventQueue = options.eventQueue;
    this.agentRunner = options.agentRunner;
    this.logger = options.logger;
  }

  /**
   * Checks if an agent run should start and executes if so.
   *
   * This is the main entry point called by the scheduler.
   * - Returns immediately if already running
   * - Returns immediately if no pending events
   * - Otherwise, starts an agent run and waits for completion
   *
   * @returns Result indicating what happened
   */
  async checkAndRun(): Promise<OrchestratorRunResult> {
    // 1. Skip if already running
    if (this.isRunning) {
      this.logger.debug("Skipping checkAndRun - agent already running");
      return { started: false, skipReason: "already_running" };
    }

    // 2. Check for pending events
    const events = await this.eventQueue.getPending();
    if (events.length === 0) {
      this.logger.debug("Skipping checkAndRun - no pending events");
      return { started: false, skipReason: "no_events" };
    }

    // 3. Start agent run
    const runId = randomUUID();
    this.isRunning = true;
    this.currentRunId = runId;

    this.logger.info(
      `Starting agent run ${runId} with ${events.length} pending event(s)`,
    );

    try {
      const agentResult = await this.agentRunner.run(events);

      if (agentResult.success) {
        this.logger.info(`Agent run ${runId} completed successfully`);
      } else {
        this.logger.error(
          `Agent run ${runId} failed: ${agentResult.error ?? "Unknown error"}`,
        );
      }

      return {
        started: true,
        runId,
        agentResult,
      };
    } catch (error) {
      // Unexpected error - events stay pending
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Agent run ${runId} threw unexpected error:`, error);

      return {
        started: true,
        runId,
        agentResult: {
          eventsProcessed: events,
          success: false,
          error: errorMessage,
        },
      };
    } finally {
      this.isRunning = false;
      this.currentRunId = null;
    }
  }

  /**
   * Gets the current status of the orchestrator
   */
  async getStatus(): Promise<OrchestratorStatus> {
    const pendingEvents = await this.eventQueue.getPending();

    return {
      isRunning: this.isRunning,
      currentRunId: this.currentRunId,
      pendingEventCount: pendingEvents.length,
    };
  }

  /**
   * Checks if an agent run is currently in progress
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Gets the current run ID (if running)
   */
  getCurrentRunId(): string | null {
    return this.currentRunId;
  }
}
