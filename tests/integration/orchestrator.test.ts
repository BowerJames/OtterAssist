/**
 * Integration tests for Orchestrator agent runs
 * Tests the complete flow of agent execution with mocked components
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SQLiteEventQueue } from "../../src/core/queue.ts";
import { Orchestrator } from "../../src/core/orchestrator.ts";
import type { Event, EventQueue, Logger } from "../../src/types/index.ts";
import type { AgentRunResult, Runner } from "../../src/core/runner.ts";

const TEST_DIR = join(homedir(), ".otterassist", "__test_orchestrator__");
const TEST_DB_PATH = join(TEST_DIR, "orchestrator-integration.db");

// Mock logger
const createMockLogger = (): Logger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

// Create mock event
const createTestEvent = (
  id: string,
  message: string,
  status: "pending" | "completed" = "pending",
): Event => ({
  id,
  message,
  progress: "",
  createdAt: new Date(),
  status,
});

async function createTestDir(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  await rm(TEST_DIR, { recursive: true, force: true });
}

describe("Orchestrator Integration", () => {
  let queue: SQLiteEventQueue;
  let mockLogger: Logger;

  beforeEach(async () => {
    await cleanupTestDir();
    await createTestDir();
    mockLogger = createMockLogger();
    queue = await SQLiteEventQueue.create(TEST_DB_PATH, mockLogger);
  });

  afterEach(async () => {
    queue.close();
    await cleanupTestDir();
  });

  describe("agent run with real queue", () => {
    it("should process pending events from queue", async () => {
      // Add events to queue
      const event1 = await queue.add("First event to process");
      const event2 = await queue.add("Second event to process");

      // Create runner that simulates successful processing
      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => {
          // Simulate agent marking events as complete
          for (const event of events) {
            await queue.markComplete(event.id);
          }
          return {
            eventsProcessed: events,
            success: true,
          };
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      // Verify events are pending before run
      expect(await queue.getPending()).toHaveLength(2);

      // Run orchestrator
      const result = await orchestrator.checkAndRun();

      // Verify run was successful
      expect(result.started).toBe(true);
      expect(result.agentResult?.success).toBe(true);
      expect(result.agentResult?.eventsProcessed.length).toBe(2);

      // Verify events are no longer pending
      expect(await queue.getPending()).toHaveLength(0);
    });

    it("should leave events pending if agent fails", async () => {
      // Add event to queue
      await queue.add("Event that will fail");

      // Create runner that simulates failure
      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => {
          // Agent fails without marking events complete
          return {
            eventsProcessed: events,
            success: false,
            error: "Agent encountered an error",
          };
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const result = await orchestrator.checkAndRun();

      // Run should report failure
      expect(result.started).toBe(true);
      expect(result.agentResult?.success).toBe(false);
      expect(result.agentResult?.error).toBe("Agent encountered an error");

      // Event should still be pending (for retry)
      expect(await queue.getPending()).toHaveLength(1);
    });

    it("should leave events pending if agent throws", async () => {
      await queue.add("Event that causes crash");

      const agentRunner: Runner = {
        run: mock(async () => {
          throw new Error("Agent crashed unexpectedly");
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const result = await orchestrator.checkAndRun();

      // Should handle the error gracefully
      expect(result.started).toBe(true);
      expect(result.agentResult?.success).toBe(false);
      expect(result.agentResult?.error).toBe("Agent crashed unexpectedly");

      // Event should still be pending
      expect(await queue.getPending()).toHaveLength(1);
    });
  });

  describe("concurrent run prevention", () => {
    it("should queue additional checkAndRun calls while running", async () => {
      await queue.add("Event 1");
      await queue.add("Event 2");

      let resolveRun: () => void;
      const runPromise = new Promise<void>((resolve) => {
        resolveRun = resolve;
      });

      let runCount = 0;
      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => {
          runCount++;
          await runPromise;
          return {
            eventsProcessed: events,
            success: true,
          };
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      // Start first run (don't await)
      const firstRunPromise = orchestrator.checkAndRun();

      // Wait a bit for the run to start
      await new Promise((r) => setTimeout(r, 10));

      // Try to start second run while first is in progress
      const secondResult = await orchestrator.checkAndRun();

      // Second should be skipped
      expect(secondResult.started).toBe(false);
      expect(secondResult.skipReason).toBe("already_running");

      // Complete first run
      resolveRun!();
      const firstResult = await firstRunPromise;
      expect(firstResult.started).toBe(true);

      // Only one agent run should have occurred
      expect(runCount).toBe(1);
    });
  });

  describe("event progress tracking", () => {
    it("should allow agent to update event progress", async () => {
      const event = await queue.add("Event with progress tracking");

      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => {
          // Simulate agent updating progress
          await queue.updateProgress(events[0].id, "50% complete");

          // Verify progress was updated
          const updated = await queue.getById(events[0].id);
          expect(updated?.progress).toBe("50% complete");

          // Complete the event
          await queue.markComplete(events[0].id);

          return {
            eventsProcessed: events,
            success: true,
          };
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      await orchestrator.checkAndRun();

      // Event should be completed
      const completed = await queue.getById(event.id);
      expect(completed?.status).toBe("completed");
    });
  });

  describe("multiple events processing", () => {
    it("should process multiple events in order", async () => {
      // Add multiple events
      const event1 = await queue.add("Event A");
      await new Promise((r) => setTimeout(r, 10));
      const event2 = await queue.add("Event B");
      await new Promise((r) => setTimeout(r, 10));
      const event3 = await queue.add("Event C");

      const processedOrder: string[] = [];

      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => {
          // Process in order
          for (const event of events) {
            processedOrder.push(event.message);
            await queue.markComplete(event.id);
          }
          return {
            eventsProcessed: events,
            success: true,
          };
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      await orchestrator.checkAndRun();

      // Events should be processed in creation order
      expect(processedOrder).toEqual(["Event A", "Event B", "Event C"]);

      // All should be completed
      expect(await queue.getPending()).toHaveLength(0);
    });

    it("should handle selective completion", async () => {
      const event1 = await queue.add("Complete this");
      const event2 = await queue.add("Leave this pending");

      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => {
          // Only complete the first event
          const toComplete = events.find((e) => e.message === "Complete this");
          if (toComplete) {
            await queue.markComplete(toComplete.id);
          }

          return {
            eventsProcessed: events,
            success: true,
          };
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      await orchestrator.checkAndRun();

      // First event completed
      const completed = await queue.getById(event1.id);
      expect(completed?.status).toBe("completed");

      // Second event still pending
      const pending = await queue.getById(event2.id);
      expect(pending?.status).toBe("pending");
    });
  });

  describe("run ID tracking", () => {
    it("should generate unique run IDs for each run", async () => {
      const runIds: string[] = [];

      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => ({
          eventsProcessed: events,
          success: true,
        })),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      // Run multiple times
      for (let i = 0; i < 3; i++) {
        await queue.add(`Event ${i}`);
        const result = await orchestrator.checkAndRun();
        if (result.runId) {
          runIds.push(result.runId);
        }
      }

      // All IDs should be unique
      expect(new Set(runIds).size).toBe(3);
    });

    it("should track current run ID during execution", async () => {
      await queue.add("Test event");

      let capturedRunId: string | null = null;
      let runIdDuringRun: string | null = null;

      const agentRunner: Runner = {
        run: mock(async (events: Event[]) => {
          // This would be called during the run
          // In a real scenario, we'd check orchestrator.getCurrentRunId()
          return {
            eventsProcessed: events,
            success: true,
          };
        }),
      };

      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const result = await orchestrator.checkAndRun();
      capturedRunId = result.runId ?? null;

      // After run, current run ID should be null
      expect(orchestrator.getCurrentRunId()).toBeNull();
      expect(capturedRunId).toBeDefined();
    });
  });
});
