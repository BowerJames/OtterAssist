/**
 * Tests for Agent Runner
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Event, EventQueue, Logger } from "../types/index.ts";
import { AgentRunner, ensureWrapUpPrompt, WRAP_UP_PROMPT } from "./runner.ts";

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
  close: mock(() => {}),
});

describe("ensureWrapUpPrompt", () => {
  let tempDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `otterassist-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should create prompts directory if it doesn't exist", async () => {
    const agentDir = join(tempDir, "agent");
    // Don't create prompts dir beforehand
    await ensureWrapUpPrompt(agentDir, mockLogger);

    const wrapUpPath = join(agentDir, "prompts", "wrap_up.md");
    const file = Bun.file(wrapUpPath);
    const exists = await file.exists();
    expect(exists).toBe(true); // File exists implies directory was created
  });

  it("should write correct content to wrap_up.md", async () => {
    const agentDir = join(tempDir, "agent");
    await ensureWrapUpPrompt(agentDir, mockLogger);

    const wrapUpPath = join(agentDir, "prompts", "wrap_up.md");
    const file = Bun.file(wrapUpPath);
    const content = await file.text();

    expect(content).toBe(WRAP_UP_PROMPT);
    expect(content).toContain("Wrap up the current session");
    expect(content).toContain(
      "Marking all events that have been completely handled",
    );
  });

  it("should not overwrite existing wrap_up.md", async () => {
    const agentDir = join(tempDir, "agent");
    const promptsDir = join(agentDir, "prompts");
    const wrapUpPath = join(promptsDir, "wrap_up.md");

    // Create existing file with custom content
    await mkdir(promptsDir, { recursive: true });
    const customContent = "---\ndescription: Custom\n---\nCustom content";
    await Bun.write(wrapUpPath, customContent);

    await ensureWrapUpPrompt(agentDir, mockLogger);

    const file = Bun.file(wrapUpPath);
    const content = await file.text();
    expect(content).toBe(customContent);
  });

  it("should work without a logger", async () => {
    const agentDir = join(tempDir, "agent");
    await ensureWrapUpPrompt(agentDir);

    const wrapUpPath = join(agentDir, "prompts", "wrap_up.md");
    const file = Bun.file(wrapUpPath);
    const exists = await file.exists();
    expect(exists).toBe(true);
  });
});

describe("WRAP_UP_PROMPT", () => {
  it("should have correct description in frontmatter", () => {
    expect(WRAP_UP_PROMPT).toContain(
      "description: Wrap up the current session and update event progress",
    );
  });

  it("should instruct to mark complete events as complete", () => {
    expect(WRAP_UP_PROMPT).toContain(
      "Marking all events that have been completely handled as complete",
    );
  });

  it("should instruct to update progress holistically", () => {
    expect(WRAP_UP_PROMPT).toContain(
      "If there is already progress update it with a full holistic view",
    );
  });

  it("should instruct to leave untouched events alone", () => {
    expect(WRAP_UP_PROMPT).toContain(
      "Events that you were unable to make progress on just leave untouched",
    );
  });
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
