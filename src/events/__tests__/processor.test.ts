import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { EventProcessor, type EventProcessorDependencies } from "../processor";
import type { LLMProvider } from "../../llm/provider";
import type { LLMResponse } from "../../llm/types";
import type { ToolRegistry } from "../../tools/registry";

describe("EventProcessor", () => {
  let processor: EventProcessor;
  let mockConvexClient: {
    mutation: ReturnType<typeof mock>;
    query: ReturnType<typeof mock>;
  };
  let mockDependencies: EventProcessorDependencies;

  beforeEach(() => {
    mockConvexClient = {
      mutation: mock(() => Promise.resolve(null)),
      query: mock(() => Promise.resolve(null)),
    };

    const mockLLMResponse: LLMResponse = {
      message: { role: "assistant", content: "" },
      finishReason: "stop",
    };

    const mockLLMProvider: LLMProvider = {
      complete: mock(() => Promise.resolve(mockLLMResponse)),
      stream: mock(() => (async function* () {})()),
    };

    const mockToolRegistry: ToolRegistry = {
      register: mock(),
      get: mock(),
      list: mock(() => []),
      listNames: mock(() => []),
      getDefinitions: mock(() => []),
      execute: mock(() => Promise.resolve({ success: true, output: "" })),
      has: mock(() => false),
      clear: mock(),
    } as unknown as ToolRegistry;

    mockDependencies = {
      createLLMProvider: mock(() => mockLLMProvider),
      createToolRegistry: mock(() => mockToolRegistry),
      onProgress: mock(),
    };

    process.env.CONVEX_URL = "https://test.convex.cloud";
  });

  afterEach(() => {
    delete process.env.CONVEX_URL;
  });

  describe("constructor", () => {
    test("should create processor with default config", () => {
      processor = new EventProcessor(mockDependencies);
      expect(processor).toBeDefined();
    });

    test("should create processor with custom config", () => {
      processor = new EventProcessor(mockDependencies, { pollIntervalMs: 500 });
      expect(processor).toBeDefined();
    });
  });

  describe("start/stop", () => {
    test("should start and stop processing", async () => {
      processor = new EventProcessor(mockDependencies);
      
      await processor.start();
      expect(processor).toBeDefined();
      
      processor.stop();
      expect(processor).toBeDefined();
    });

    test("should not start twice", async () => {
      processor = new EventProcessor(mockDependencies);
      
      await processor.start();
      await processor.start();
      
      processor.stop();
    });
  });

  describe("buildTriggerContext", () => {
    test("should build webhook context for webhook events", () => {
      processor = new EventProcessor(mockDependencies);
      
      const event = {
        _id: "event1" as any,
        type: "webhook.received",
        payload: { source: "github", data: "test" },
        status: "pending",
        createdAt: Date.now(),
      };

      const context = (processor as any).buildTriggerContext(event);
      
      expect(context.type).toBe("webhook");
      expect(context.source).toBe("github");
    });

    test("should build file_change context for file events", () => {
      processor = new EventProcessor(mockDependencies);
      
      const event = {
        _id: "event1" as any,
        type: "file_created",
        payload: { path: "/workspace/test.txt" },
        status: "pending",
        createdAt: Date.now(),
      };

      const context = (processor as any).buildTriggerContext(event);
      
      expect(context.type).toBe("file_change");
      expect(context.path).toBe("/workspace/test.txt");
      expect(context.action).toBe("created");
    });

    test("should build scheduled context for scheduled events", () => {
      processor = new EventProcessor(mockDependencies);
      
      const event = {
        _id: "event1" as any,
        type: "scheduled",
        payload: { scheduleName: "daily", schedule: "0 0 * * *" },
        status: "pending",
        createdAt: Date.now(),
      };

      const context = (processor as any).buildTriggerContext(event);
      
      expect(context.type).toBe("scheduled");
      expect(context.name).toBe("daily");
    });
  });

  describe("buildInstructions", () => {
    test("should build instructions for webhook event", () => {
      processor = new EventProcessor(mockDependencies);
      
      const event = {
        _id: "event1" as any,
        type: "webhook.received",
        payload: { source: "slack" },
        status: "pending",
        createdAt: Date.now(),
      };

      const instructions = (processor as any).buildInstructions(event);
      
      expect(instructions).toContain("webhook");
      expect(instructions).toContain("slack");
    });

    test("should build instructions for file_created event", () => {
      processor = new EventProcessor(mockDependencies);
      
      const event = {
        _id: "event1" as any,
        type: "file_created",
        payload: { path: "/workspace/newfile.md" },
        status: "pending",
        createdAt: Date.now(),
      };

      const instructions = (processor as any).buildInstructions(event);
      
      expect(instructions).toContain("new file was created");
      expect(instructions).toContain("/workspace/newfile.md");
    });

    test("should build instructions for file_modified event", () => {
      processor = new EventProcessor(mockDependencies);
      
      const event = {
        _id: "event1" as any,
        type: "file_modified",
        payload: { path: "/workspace/changed.txt" },
        status: "pending",
        createdAt: Date.now(),
      };

      const instructions = (processor as any).buildInstructions(event);
      
      expect(instructions).toContain("modified");
      expect(instructions).toContain("/workspace/changed.txt");
    });

    test("should build instructions for file_deleted event", () => {
      processor = new EventProcessor(mockDependencies);
      
      const event = {
        _id: "event1" as any,
        type: "file_deleted",
        payload: { path: "/workspace/deleted.txt" },
        status: "pending",
        createdAt: Date.now(),
      };

      const instructions = (processor as any).buildInstructions(event);
      
      expect(instructions).toContain("deleted");
      expect(instructions).toContain("/workspace/deleted.txt");
    });
  });

  describe("extractFileAction", () => {
    test("should extract created action", () => {
      processor = new EventProcessor(mockDependencies);
      
      expect((processor as any).extractFileAction("file_created")).toBe("created");
    });

    test("should extract modified action", () => {
      processor = new EventProcessor(mockDependencies);
      
      expect((processor as any).extractFileAction("file_modified")).toBe("modified");
    });

    test("should extract deleted action", () => {
      processor = new EventProcessor(mockDependencies);
      
      expect((processor as any).extractFileAction("file_deleted")).toBe("deleted");
    });

    test("should default to modified for unknown event type", () => {
      processor = new EventProcessor(mockDependencies);
      
      expect((processor as any).extractFileAction("file_unknown")).toBe("modified");
    });
  });
});
