/**
 * Integration tests for full scheduler tick cycle
 * Tests the complete flow from extension polling to event creation and orchestrator triggering
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SQLiteEventQueue } from "../../src/core/queue.ts";
import { Scheduler } from "../../src/core/scheduler.ts";
import { Orchestrator } from "../../src/core/orchestrator.ts";
import type { EventQueue, Logger } from "../../src/types/index.ts";
import type { ExtensionManager } from "../../src/extensions/manager.ts";
import type { AgentRunResult, Runner } from "../../src/core/runner.ts";

const TEST_DIR = join(homedir(), ".otterassist", "__test_integration__");
const TEST_DB_PATH = join(TEST_DIR, "scheduler-integration.db");

// Mock logger
const createMockLogger = (): Logger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

// Mock extension manager that returns configurable messages
const createMockExtensionManager = (messages: string[] = []) => ({
  pollAll: mock(async () => [...messages]),
  loadAll: mock(async () => {}),
  shutdownAll: mock(async () => {}),
  get: mock(() => undefined),
  getLoadedNames: mock(() => []),
});

// Mock agent runner
const createMockAgentRunner = (
  result: AgentRunResult = { eventsProcessed: [], success: true },
): Runner => ({
  run: mock(async () => result),
});

async function createTestDir(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  await rm(TEST_DIR, { recursive: true, force: true });
}

describe("Scheduler Integration", () => {
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

  describe("full tick cycle", () => {
    it("should poll extensions, add events to queue, and trigger orchestrator", async () => {
      const messages = ["Event from extension 1", "Event from extension 2"];
      const extensionManager = createMockExtensionManager(messages);
      const agentRunner = createMockAgentRunner({
        eventsProcessed: [],
        success: true,
      });
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      // Trigger a tick
      await scheduler.triggerNow();

      // Verify extensions were polled
      expect(extensionManager.pollAll).toHaveBeenCalledTimes(1);

      // Verify events were added to queue
      const pendingEvents = await queue.getPending();
      expect(pendingEvents.length).toBe(2);
      expect(pendingEvents.map((e) => e.message).sort()).toEqual(
        messages.sort(),
      );

      // Verify orchestrator was triggered
      expect(agentRunner.run).toHaveBeenCalledTimes(1);
    });

    it("should handle tick cycle with no events from extensions", async () => {
      const extensionManager = createMockExtensionManager([]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      await scheduler.triggerNow();

      // No events should be added
      const pendingEvents = await queue.getPending();
      expect(pendingEvents.length).toBe(0);

      // Orchestrator should still be called (it will skip due to no events)
      expect(agentRunner.run).not.toHaveBeenCalled();
    });

    it("should process existing pending events even when no new events arrive", async () => {
      // Pre-populate queue with existing event
      const existingEvent = await queue.add("Pre-existing event");

      const extensionManager = createMockExtensionManager([]); // No new events
      const agentRunner = createMockAgentRunner({
        eventsProcessed: [
          {
            id: existingEvent.id,
            message: existingEvent.message,
            progress: "",
            createdAt: existingEvent.createdAt,
            status: "pending",
          },
        ],
        success: true,
      });
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      await scheduler.triggerNow();

      // Agent should have been called with the existing event
      expect(agentRunner.run).toHaveBeenCalledTimes(1);
      const calledWithEvents = agentRunner.run.mock.calls[0][0];
      expect(calledWithEvents.length).toBe(1);
      expect(calledWithEvents[0].message).toBe("Pre-existing event");
    });
  });

  describe("multiple tick cycles", () => {
    it("should accumulate events across multiple ticks", async () => {
      // First tick returns 1 event
      const extensionManager = createMockExtensionManager(["Event 1"]);
      const agentRunner = createMockAgentRunner({
        eventsProcessed: [],
        success: true,
      });
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      // First tick
      await scheduler.triggerNow();
      expect(await queue.getPending()).toHaveLength(1);

      // Update mock to return different events for second tick
      (extensionManager.pollAll as ReturnType<typeof mock>).mockImplementation(
        async () => ["Event 2", "Event 3"],
      );

      // Second tick
      await scheduler.triggerNow();
      expect(await queue.getPending()).toHaveLength(3);
    });

    it("should track tick count correctly", async () => {
      const extensionManager = createMockExtensionManager([]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      expect(scheduler.getStatus().tickCount).toBe(0);

      await scheduler.triggerNow();
      expect(scheduler.getStatus().tickCount).toBe(1);

      await scheduler.triggerNow();
      expect(scheduler.getStatus().tickCount).toBe(2);

      await scheduler.triggerNow();
      expect(scheduler.getStatus().tickCount).toBe(3);
    });
  });

  describe("error handling in tick cycle", () => {
    it("should continue cycle even if extension poll fails", async () => {
      const extensionManager = {
        pollAll: mock(async () => {
          throw new Error("Extension poll failed");
        }),
        loadAll: mock(async () => {}),
        shutdownAll: mock(async () => {}),
        get: mock(() => undefined),
        getLoadedNames: mock(() => []),
      };

      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      // Should not throw
      await scheduler.triggerNow();

      // Orchestrator should still be called
      expect(agentRunner.run).not.toHaveBeenCalled(); // No events to process
    });

    it("should continue cycle even if event queue add fails", async () => {
      const extensionManager = createMockExtensionManager(["Event 1"]);

      // Create a broken queue
      const brokenQueue = {
        add: mock(async () => {
          throw new Error("Queue add failed");
        }),
        getPending: mock(async () => []),
        getById: mock(async () => null),
        updateProgress: mock(async () => {}),
        markComplete: mock(async () => {}),
        purgeCompleted: mock(async () => 0),
      };

      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue: brokenQueue as unknown as EventQueue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue: brokenQueue as unknown as EventQueue,
        orchestrator,
        logger: mockLogger,
      });

      // Should not throw
      await scheduler.triggerNow();

      // Should have attempted to add
      expect(brokenQueue.add).toHaveBeenCalledWith("Event 1");
    });
  });

  describe("start/stop with real intervals", () => {
    it("should run ticks at configured interval", async () => {
      const extensionManager = createMockExtensionManager(["Periodic event"]);
      const agentRunner = createMockAgentRunner({
        eventsProcessed: [],
        success: true,
      });
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 0.1, // 100ms for testing
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      scheduler.start();

      // Wait for initial tick + 2 intervals (300ms total)
      await new Promise((r) => setTimeout(r, 350));

      await scheduler.stop();

      // Should have run at least 3 times (initial + 2 intervals)
      expect(extensionManager.pollAll.mock.calls.length).toBeGreaterThanOrEqual(
        3,
      );
    });

    it("should stop accepting new ticks after stop()", async () => {
      const extensionManager = createMockExtensionManager(["Event"]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue: queue,
        agentRunner,
        logger: mockLogger,
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 0.05, // 50ms
        extensionManager,
        eventQueue: queue,
        orchestrator,
        logger: mockLogger,
      });

      scheduler.start();
      await new Promise((r) => setTimeout(r, 100));
      await scheduler.stop();

      const callCountAfterStop = extensionManager.pollAll.mock.calls.length;

      // Wait more time
      await new Promise((r) => setTimeout(r, 200));

      // Should not have increased
      expect(extensionManager.pollAll.mock.calls.length).toBe(callCountAfterStop);
    });
  });
});
