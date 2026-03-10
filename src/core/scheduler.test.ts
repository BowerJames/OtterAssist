/**
 * Tests for Scheduler
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ExtensionManager } from "../extensions/manager.ts";
import type { EventQueue, Logger } from "../types/index.ts";
import type { Orchestrator, OrchestratorRunResult } from "./orchestrator.ts";
import type { Runner } from "./runner.ts";
import { Scheduler } from "./scheduler.ts";

// Mock logger
const createMockLogger = (): Logger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

// Mock event queue
const createMockEventQueue = (): EventQueue =>
  ({
    add: mock(async () => {}),
    getPending: mock(async () => []),
    getById: mock(async () => null),
    updateProgress: mock(async () => {}),
    markComplete: mock(async () => {}),
    purgeCompleted: mock(async () => 0),
    close: mock(() => {}),
  }) as unknown as EventQueue;

// Mock extension manager
const createMockExtensionManager = (
  messages: string[] = [],
): ExtensionManager =>
  ({
    pollAll: mock(async () => messages),
    loadAll: mock(async () => {}),
    shutdownAll: mock(async () => {}),
    get: mock(() => undefined),
    getLoadedNames: mock(() => []),
    extensions: [],
    piExtensions: [],
    logger: createMockLogger(),
    config: { pollIntervalSeconds: 60, extensions: {} },
    hasPiExtensions: () => false,
    getPiExtensions: () => [],
  }) as unknown as ExtensionManager;

// Mock orchestrator
const createMockOrchestrator = (
  result: OrchestratorRunResult = { started: false, skipReason: "no_events" },
): Orchestrator =>
  ({
    checkAndRun: mock(async () => result),
    getStatus: mock(async () => ({
      isRunning: false,
      currentRunId: null,
      pendingEventCount: 0,
    })),
    getIsRunning: mock(() => false),
    getCurrentRunId: mock(() => null),
    eventQueue: createMockEventQueue(),
    agentRunner: {} as unknown as Runner,
    logger: createMockLogger(),
    isRunning: false,
    currentRunId: null,
  }) as unknown as Orchestrator;

describe("Scheduler", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe("constructor", () => {
    it("should create scheduler with options", () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      expect(scheduler.getIsRunning()).toBe(false);
    });
  });

  describe("start", () => {
    it("should start the scheduler and run first tick immediately", async () => {
      const extensionManager = createMockExtensionManager(["event 1"]);
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator({
        started: true,
        runId: "test-run",
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      scheduler.start();

      expect(scheduler.getIsRunning()).toBe(true);

      // Wait for first tick to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(extensionManager.pollAll).toHaveBeenCalled();
      expect(eventQueue.add).toHaveBeenCalledWith("event 1");
      expect(orchestrator.checkAndRun).toHaveBeenCalled();

      // Clean up
      await scheduler.stop();
    });

    it("should not start twice", async () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      scheduler.start();
      scheduler.start(); // Second call should be ignored

      await new Promise((r) => setTimeout(r, 50));

      // Should only have polled once (first tick)
      expect(extensionManager.pollAll).toHaveBeenCalledTimes(1);

      await scheduler.stop();
    });
  });

  describe("stop", () => {
    it("should stop the scheduler", async () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 1,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      scheduler.start();
      expect(scheduler.getIsRunning()).toBe(true);

      await scheduler.stop();

      expect(scheduler.getIsRunning()).toBe(false);
    });

    it("should wait for in-progress tick to complete", async () => {
      let resolvePoll: (() => void) | undefined;
      const pollPromise = new Promise<string[]>((resolve) => {
        resolvePoll = () => resolve([]);
      });

      const extensionManager = createMockExtensionManager();
      (extensionManager.pollAll as ReturnType<typeof mock>).mockImplementation(
        () => pollPromise,
      );

      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      scheduler.start();

      // Wait for tick to start
      await new Promise((r) => setTimeout(r, 10));
      expect(scheduler.getIsTicking()).toBe(true);

      // Start stopping (should wait)
      const stopPromise = scheduler.stop();

      // Still ticking while stop is waiting
      expect(scheduler.getIsTicking()).toBe(true);

      // Complete the poll
      resolvePoll?.();

      // Now stop should complete
      await stopPromise;
      expect(scheduler.getIsTicking()).toBe(false);
    });

    it("should be safe to call when not running", async () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      // Should not throw
      await scheduler.stop();
    });
  });

  describe("triggerNow", () => {
    it("should trigger a tick immediately", async () => {
      const extensionManager = createMockExtensionManager(["manual event"]);
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator({
        started: true,
        runId: "test-run",
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      await scheduler.triggerNow();

      expect(extensionManager.pollAll).toHaveBeenCalled();
      expect(eventQueue.add).toHaveBeenCalledWith("manual event");
      expect(orchestrator.checkAndRun).toHaveBeenCalled();
    });

    it("should work without starting the scheduler", async () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      // triggerNow should work even if scheduler is not started
      await scheduler.triggerNow();

      expect(extensionManager.pollAll).toHaveBeenCalled();
    });
  });

  describe("tick behavior", () => {
    it("should poll extensions, add events, and trigger orchestrator", async () => {
      const extensionManager = createMockExtensionManager([
        "event 1",
        "event 2",
      ]);
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator({
        started: true,
        runId: "test-run",
      });

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      await scheduler.triggerNow();

      // 1. Poll extensions
      expect(extensionManager.pollAll).toHaveBeenCalledTimes(1);

      // 2. Add events to queue
      expect(eventQueue.add).toHaveBeenCalledTimes(2);
      expect(eventQueue.add).toHaveBeenCalledWith("event 1");
      expect(eventQueue.add).toHaveBeenCalledWith("event 2");

      // 3. Trigger orchestrator
      expect(orchestrator.checkAndRun).toHaveBeenCalledTimes(1);
    });

    it("should handle empty poll results", async () => {
      const extensionManager = createMockExtensionManager([]);
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      await scheduler.triggerNow();

      expect(extensionManager.pollAll).toHaveBeenCalled();
      expect(eventQueue.add).not.toHaveBeenCalled();
      expect(orchestrator.checkAndRun).toHaveBeenCalled();
    });

    it("should continue if extension poll fails", async () => {
      const extensionManager = createMockExtensionManager();
      (extensionManager.pollAll as ReturnType<typeof mock>).mockImplementation(
        async () => {
          throw new Error("Poll failed");
        },
      );

      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      // Should not throw
      await scheduler.triggerNow();

      // Should still try to trigger orchestrator
      expect(orchestrator.checkAndRun).toHaveBeenCalled();
    });

    it("should continue if adding event fails", async () => {
      const extensionManager = createMockExtensionManager([
        "event 1",
        "event 2",
      ]);

      const eventQueue = createMockEventQueue();
      (eventQueue.add as ReturnType<typeof mock>).mockImplementation(
        async (message: string) => {
          if (message === "event 1") {
            throw new Error("Failed to add");
          }
        },
      );

      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      // Should not throw
      await scheduler.triggerNow();

      // Should have tried both events
      expect(eventQueue.add).toHaveBeenCalledTimes(2);
      // Should still trigger orchestrator
      expect(orchestrator.checkAndRun).toHaveBeenCalled();
    });

    it("should skip tick if one is already in progress", async () => {
      let resolvePoll: (() => void) | undefined;
      const pollPromise = new Promise<string[]>((resolve) => {
        resolvePoll = () => resolve([]);
      });

      let pollCallCount = 0;
      const extensionManager = createMockExtensionManager();
      (extensionManager.pollAll as ReturnType<typeof mock>).mockImplementation(
        async () => {
          pollCallCount++;
          if (pollCallCount === 1) {
            return pollPromise;
          }
          return [];
        },
      );

      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      scheduler.start();

      // Wait for first tick to start
      await new Promise((r) => setTimeout(r, 10));

      // Manually trigger while first tick is in progress
      await scheduler.triggerNow();

      // Complete first poll
      resolvePoll?.();
      await new Promise((r) => setTimeout(r, 10));

      // First tick + manual trigger that was skipped = only 1 pollAll call
      // (manual trigger sees isTicking and returns early)
      expect(pollCallCount).toBe(1);

      await scheduler.stop();
    });
  });

  describe("getStatus", () => {
    it("should return correct status when idle", () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 30,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      const status = scheduler.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.isTicking).toBe(false);
      expect(status.pollIntervalSeconds).toBe(30);
      expect(status.lastTickAt).toBeNull();
      expect(status.tickCount).toBe(0);
    });

    it("should return correct status after tick", async () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      await scheduler.triggerNow();

      const status = scheduler.getStatus();

      expect(status.tickCount).toBe(1);
      expect(status.lastTickAt).not.toBeNull();
    });
  });

  describe("getIsTicking", () => {
    it("should return false when not ticking", () => {
      const extensionManager = createMockExtensionManager();
      const eventQueue = createMockEventQueue();
      const orchestrator = createMockOrchestrator();

      const scheduler = new Scheduler({
        pollIntervalSeconds: 60,
        extensionManager,
        eventQueue,
        orchestrator,
        logger: mockLogger,
      });

      expect(scheduler.getIsTicking()).toBe(false);
    });
  });
});
