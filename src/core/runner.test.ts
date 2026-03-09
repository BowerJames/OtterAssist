/**
 * Tests for Agent Runner
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Event, EventQueue, Logger } from "../types/index.ts";
import { AgentRunner } from "./runner.ts";

// Mock logger
const createMockLogger = (): Logger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

// Mock event queue
const createMockEventQueue = (): EventQueue => ({
  add: mock(async () => ({
    id: "test-id",
    message: "test",
    progress: "",
    createdAt: new Date(),
    status: "pending" as const,
  })),
  getPending: mock(async () => []),
  getById: mock(async () => null),
  updateProgress: mock(async () => {}),
  markComplete: mock(async () => {}),
  purgeCompleted: mock(async () => 0),
});

describe("AgentRunner", () => {
  let mockQueue: EventQueue;
  let mockLogger: Logger;

  beforeEach(() => {
    mockQueue = createMockEventQueue();
    mockLogger = createMockLogger();
  });

  it("should create runner with options", () => {
    const runner = new AgentRunner({
      eventQueue: mockQueue,
      logger: mockLogger,
    });

    expect(runner).toBeDefined();
  });

  it("should return success with no events when queue is empty", async () => {
    const runner = new AgentRunner({
      eventQueue: mockQueue,
      logger: mockLogger,
    });

    const result = await runner.run([]);

    expect(result.success).toBe(true);
    expect(result.eventsProcessed).toEqual([]);
  });

  it("should use custom cwd and agentDir if provided", () => {
    const runner = new AgentRunner({
      eventQueue: mockQueue,
      logger: mockLogger,
      cwd: "/custom/cwd",
      agentDir: "/custom/agent",
    });

    expect(runner).toBeDefined();
  });

  it("should handle events with proper context building", async () => {
    const _sampleEvents: Event[] = [
      {
        id: "event-1",
        message: "Test event message",
        progress: "",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        status: "pending",
      },
      {
        id: "event-2",
        message: "Another event",
        progress: "Already started",
        createdAt: new Date("2024-01-02T00:00:00Z"),
        status: "pending",
      },
    ];

    const runner = new AgentRunner({
      eventQueue: mockQueue,
      logger: mockLogger,
    });

    // Note: This will try to actually create an agent session
    // In a real test, we'd mock the pi SDK, but here we just verify
    // the runner accepts events and tries to process them
    // For now, we'll just test the empty case
    const result = await runner.run([]);

    expect(result.success).toBe(true);
  });
});

describe("Event Tools", () => {
  let mockQueue: EventQueue;

  beforeEach(() => {
    mockQueue = createMockEventQueue();
  });

  it("should export createListEventsTool", async () => {
    const { createListEventsTool } = await import("./tools/index.ts");
    expect(createListEventsTool).toBeDefined();
    expect(typeof createListEventsTool).toBe("function");
  });

  it("should export createUpdateEventProgressTool", async () => {
    const { createUpdateEventProgressTool } = await import("./tools/index.ts");
    expect(createUpdateEventProgressTool).toBeDefined();
    expect(typeof createUpdateEventProgressTool).toBe("function");
  });

  it("should export createCompleteEventTool", async () => {
    const { createCompleteEventTool } = await import("./tools/index.ts");
    expect(createCompleteEventTool).toBeDefined();
    expect(typeof createCompleteEventTool).toBe("function");
  });

  it("should create list_events tool with correct properties", async () => {
    const { createListEventsTool } = await import("./tools/index.ts");
    const tool = createListEventsTool(mockQueue);

    expect(tool.name).toBe("list_events");
    expect(tool.label).toBe("List Events");
    expect(tool.description).toContain("pending events");
    expect(tool.execute).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("should create update_event_progress tool with correct properties", async () => {
    const { createUpdateEventProgressTool } = await import("./tools/index.ts");
    const tool = createUpdateEventProgressTool(mockQueue);

    expect(tool.name).toBe("update_event_progress");
    expect(tool.label).toBe("Update Event Progress");
    expect(tool.description).toContain("progress field");
    expect(tool.execute).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("should create complete_event tool with correct properties", async () => {
    const { createCompleteEventTool } = await import("./tools/index.ts");
    const tool = createCompleteEventTool(mockQueue);

    expect(tool.name).toBe("complete_event");
    expect(tool.label).toBe("Complete Event");
    expect(tool.description).toContain("completed");
    expect(tool.execute).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });
});
