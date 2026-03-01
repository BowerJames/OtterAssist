import { test, expect, describe, mock, beforeEach } from "bun:test";
import { AgentExecutor } from "../executor";
import type { LLMProvider, LLMTool } from "../../llm/provider";
import type { LLMResponse } from "../../llm/types";
import { ToolRegistry } from "../../tools/registry";
import type { AgentConfig, TriggerContext, ExecutorProgress } from "../types";

function createMockProvider(responses: LLMResponse[]): LLMProvider {
  let callCount = 0;
  return {
    complete: mock(async (): Promise<LLMResponse> => {
      const response = responses[callCount] ?? responses[responses.length - 1]!;
      callCount++;
      return response;
    }),
    stream: mock(async function* () {}),
  };
}

function createMockToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "echo",
    description: "Echo a message",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo" },
      },
      required: ["message"],
    },
    execute: async (args) => ({
      success: true,
      output: args.message as string,
    }),
  });

  registry.register({
    name: "fail",
    description: "A tool that fails",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => ({
      success: false,
      error: "Tool failed intentionally",
    }),
  });

  return registry;
}

describe("AgentExecutor", () => {
  let config: AgentConfig;
  let toolRegistry: ToolRegistry;
  let progressEvents: ExecutorProgress[];

  beforeEach(() => {
    config = {
      agentId: "test-agent",
      name: "Test Agent",
      systemPrompt: "You are a test agent.",
      llmProvider: "openai",
      llmModel: "gpt-4",
      tools: [],
    };
    toolRegistry = createMockToolRegistry();
    progressEvents = [];
  });

  test("executes simple task without tools", async () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Task completed!" },
        finishReason: "stop",
      },
    ]);

    const executor = new AgentExecutor(config, {
      llmProvider: provider,
      toolRegistry,
      onProgress: (p) => progressEvents.push(p),
    });

    const result = await executor.execute(
      "Say hello",
      { type: "manual", customInstructions: "Test task" },
      "run-123"
    );

    expect(result.success).toBe(true);
    expect(result.finalMessage).toBe("Task completed!");
    expect(result.iterations).toBe(1);
    expect(result.finishReason).toBe("completed");
    expect(progressEvents[0]?.status).toBe("running");
  });

  test("executes tool calls and continues loop", async () => {
    const provider = createMockProvider([
      {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc-1", name: "echo", parameters: { message: "Hello" } }],
        },
        finishReason: "tool_calls",
      },
      {
        message: { role: "assistant", content: "Echoed: Hello" },
        finishReason: "stop",
      },
    ]);

    const executor = new AgentExecutor(config, {
      llmProvider: provider,
      toolRegistry,
    });

    const result = await executor.execute(
      "Echo hello",
      { type: "manual" },
      "run-456"
    );

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);
  });

  test("handles tool execution errors gracefully", async () => {
    const provider = createMockProvider([
      {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc-1", name: "fail", parameters: {} }],
        },
        finishReason: "tool_calls",
      },
      {
        message: { role: "assistant", content: "I handled the error" },
        finishReason: "stop",
      },
    ]);

    const executor = new AgentExecutor(config, {
      llmProvider: provider,
      toolRegistry,
    });

    const result = await executor.execute(
      "Try a failing tool",
      { type: "manual" },
      "run-789"
    );

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(2);
  });

  test("stops at max iterations", async () => {
    const provider = createMockProvider([
      {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc-1", name: "echo", parameters: { message: "loop" } }],
        },
        finishReason: "tool_calls",
      },
    ]);

    const executor = new AgentExecutor(
      config,
      { llmProvider: provider, toolRegistry },
      { maxIterations: 3 }
    );

    const result = await executor.execute(
      "Loop forever",
      { type: "manual" },
      "run-max"
    );

    expect(result.success).toBe(false);
    expect(result.finishReason).toBe("iteration_limit");
    expect(result.iterations).toBe(3);
  });

  test("handles LLM errors", async () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "API Error" },
        finishReason: "error",
      },
    ]);

    const executor = new AgentExecutor(config, {
      llmProvider: provider,
      toolRegistry,
    });

    const result = await executor.execute(
      "Cause an error",
      { type: "manual" },
      "run-error"
    );

    expect(result.success).toBe(false);
    expect(result.finishReason).toBe("error");
  });

  test("filters tools by config", async () => {
    let capturedTools: LLMTool[] | undefined;

    const provider: LLMProvider = {
      complete: mock(async (_messages, tools): Promise<LLMResponse> => {
        capturedTools = tools;
        return {
          message: { role: "assistant", content: "Done" },
          finishReason: "stop",
        };
      }),
      stream: mock(async function* () {}),
    };

    const limitedConfig: AgentConfig = {
      ...config,
      tools: ["echo"],
    };

    const executor = new AgentExecutor(limitedConfig, {
      llmProvider: provider,
      toolRegistry,
    });

    await executor.execute("Test", { type: "manual" }, "run-filtered");

    expect(capturedTools).toHaveLength(1);
    expect(capturedTools?.[0]?.name).toBe("echo");
  });

  test("reports progress during execution", async () => {
    const provider = createMockProvider([
      {
        message: {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc-1", name: "echo", parameters: { message: "test" } }],
        },
        finishReason: "tool_calls",
      },
      {
        message: { role: "assistant", content: "Done" },
        finishReason: "stop",
      },
    ]);

    const executor = new AgentExecutor(config, {
      llmProvider: provider,
      toolRegistry,
      onProgress: (p) => progressEvents.push(p),
    });

    await executor.execute("Test progress", { type: "manual" }, "run-progress");

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.some((e) => e.status === "running")).toBe(true);
    expect(progressEvents.some((e) => e.status === "completed")).toBe(true);
  });

  test("creates trajectory file", async () => {
    const provider = createMockProvider([
      {
        message: { role: "assistant", content: "Done" },
        finishReason: "stop",
      },
    ]);

    const executor = new AgentExecutor(config, {
      llmProvider: provider,
      toolRegistry,
    });

    const result = await executor.execute(
      "Test trajectory",
      { type: "manual" },
      "run-trajectory-test"
    );

    expect(result.trajectoryPath).toContain("run-trajectory-test");
    expect(result.trajectoryPath).toContain(".jsonl");

    const file = Bun.file(result.trajectoryPath);
    expect(await file.exists()).toBe(true);
  });
});
