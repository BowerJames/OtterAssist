/**
 * Tests for Agent Orchestrator
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Event, EventQueue, Logger } from "../types/index.ts";
import { Orchestrator } from "./orchestrator.ts";
import type { AgentRunResult, Runner } from "./runner.ts";

// Mock logger
const createMockLogger = (): Logger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

// Mock event
const createMockEvent = (id: string, message: string): Event => ({
  id,
  message,
  progress: "",
  createdAt: new Date(),
  status: "pending",
});

// Mock event queue
const createMockEventQueue = (events: Event[] = []): EventQueue => ({
  add: mock(async () => createMockEvent("new-id", "new event")),
  getPending: mock(async () => events),
  getById: mock(async () => null),
  updateProgress: mock(async () => {}),
  markComplete: mock(async () => {}),
  purgeCompleted: mock(async () => 0),
});

// Mock agent runner
const createMockAgentRunner = (
  result: AgentRunResult = { eventsProcessed: [], success: true },
): Runner => ({
  run: mock(async () => result),
});

describe("Orchestrator", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe("checkAndRun", () => {
    it("should skip when no pending events", async () => {
      const eventQueue = createMockEventQueue([]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      const result = await orchestrator.checkAndRun();

      expect(result.started).toBe(false);
      expect(result.skipReason).toBe("no_events");
      expect(result.runId).toBeUndefined();
      expect(agentRunner.run).not.toHaveBeenCalled();
    });

    it("should start agent run when events exist", async () => {
      const events = [
        createMockEvent("event-1", "Test event 1"),
        createMockEvent("event-2", "Test event 2"),
      ];
      const eventQueue = createMockEventQueue(events);
      const agentRunner = createMockAgentRunner({
        eventsProcessed: events,
        success: true,
      });
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      const result = await orchestrator.checkAndRun();

      expect(result.started).toBe(true);
      expect(result.skipReason).toBeUndefined();
      expect(result.runId).toBeDefined();
      expect(result.agentResult?.success).toBe(true);
      expect(agentRunner.run).toHaveBeenCalledTimes(1);
      expect(agentRunner.run).toHaveBeenCalledWith(events);
    });

    it("should skip when already running", async () => {
      const events = [createMockEvent("event-1", "Test event")];
      const eventQueue = createMockEventQueue(events);

      // Create a runner that takes time to complete
      let resolveRun: ((result: AgentRunResult) => void) | null = null;
      const runPromise = new Promise<AgentRunResult>((resolve) => {
        resolveRun = resolve;
      });

      const agentRunner: Runner = {
        run: mock(() => runPromise),
      };

      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      // Start first run (don't await yet)
      const firstRunPromise = orchestrator.checkAndRun();

      // Give it a moment to start the run and set isRunning = true
      await new Promise((r) => setTimeout(r, 10));

      // Now isRunning should be true
      expect(orchestrator.getIsRunning()).toBe(true);

      // Try to start second run while first is in progress
      const secondResult = await orchestrator.checkAndRun();

      expect(secondResult.started).toBe(false);
      expect(secondResult.skipReason).toBe("already_running");

      // Complete first run
      resolveRun?.({ eventsProcessed: events, success: true });
      const firstResult = await firstRunPromise;
      expect(firstResult.started).toBe(true);
    });

    it("should reset isRunning after successful run", async () => {
      const events = [createMockEvent("event-1", "Test event")];
      const eventQueue = createMockEventQueue(events);
      const agentRunner = createMockAgentRunner({
        eventsProcessed: events,
        success: true,
      });
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      expect(orchestrator.getIsRunning()).toBe(false);

      await orchestrator.checkAndRun();

      expect(orchestrator.getIsRunning()).toBe(false);
    });

    it("should reset isRunning after failed run", async () => {
      const events = [createMockEvent("event-1", "Test event")];
      const eventQueue = createMockEventQueue(events);
      const agentRunner = createMockAgentRunner({
        eventsProcessed: events,
        success: false,
        error: "Agent failed",
      });
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      await orchestrator.checkAndRun();

      expect(orchestrator.getIsRunning()).toBe(false);
    });

    it("should reset isRunning after runner throws", async () => {
      const events = [createMockEvent("event-1", "Test event")];
      const eventQueue = createMockEventQueue(events);
      const agentRunner: Runner = {
        run: mock(async () => {
          throw new Error("Unexpected error");
        }),
      };
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      const result = await orchestrator.checkAndRun();

      expect(orchestrator.getIsRunning()).toBe(false);
      expect(result.agentResult?.success).toBe(false);
      expect(result.agentResult?.error).toBe("Unexpected error");
    });

    it("should generate unique run IDs", async () => {
      const eventQueue = createMockEventQueue([
        createMockEvent("event-1", "Test"),
      ]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      const result1 = await orchestrator.checkAndRun();
      const result2 = await orchestrator.checkAndRun();

      expect(result1.runId).toBeDefined();
      expect(result2.runId).toBeDefined();
      expect(result1.runId).not.toBe(result2.runId);
    });
  });

  describe("getStatus", () => {
    it("should return correct status when idle", async () => {
      const eventQueue = createMockEventQueue([]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      const status = await orchestrator.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.currentRunId).toBeNull();
      expect(status.pendingEventCount).toBe(0);
    });

    it("should return correct pending event count", async () => {
      const events = [
        createMockEvent("event-1", "Test 1"),
        createMockEvent("event-2", "Test 2"),
        createMockEvent("event-3", "Test 3"),
      ];
      const eventQueue = createMockEventQueue(events);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      const status = await orchestrator.getStatus();

      expect(status.pendingEventCount).toBe(3);
    });
  });

  describe("getIsRunning", () => {
    it("should return false initially", () => {
      const eventQueue = createMockEventQueue([]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      expect(orchestrator.getIsRunning()).toBe(false);
    });
  });

  describe("getCurrentRunId", () => {
    it("should return null initially", () => {
      const eventQueue = createMockEventQueue([]);
      const agentRunner = createMockAgentRunner();
      const orchestrator = new Orchestrator({
        eventQueue,
        agentRunner,
        logger: mockLogger,
      });

      expect(orchestrator.getCurrentRunId()).toBeNull();
    });
  });
});
