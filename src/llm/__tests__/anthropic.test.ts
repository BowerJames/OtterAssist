import { test, expect, describe, mock } from "bun:test";
import type { Message } from "@anthropic-ai/sdk/resources/messages";

const mockMessage: Message = {
  id: "msg-test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello! How can I help you?", citations: null }],
  model: "claude-3-5-sonnet-20241022",
  stop_reason: "end_turn",
  stop_sequence: null,
  container: null,
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    server_tool_use: null,
    service_tier: null,
  },
};

const mockToolUseMessage: Message = {
  id: "msg-tool",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "tool_use",
      id: "toolu_123",
      name: "get_weather",
      input: { city: "San Francisco" },
      caller: { type: "direct" },
    },
  ],
  model: "claude-3-5-sonnet-20241022",
  stop_reason: "tool_use",
  stop_sequence: null,
  container: null,
  usage: {
    input_tokens: 15,
    output_tokens: 10,
    cache_creation: null,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    inference_geo: null,
    server_tool_use: null,
    service_tier: null,
  },
};

mock.module("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: async (params: any) => {
          if (params.tools) {
            return mockToolUseMessage;
          }
          return mockMessage;
        },
        stream: (params: any) => {
          return new MockStream(params.tools ? mockToolUseMessage : mockMessage);
        },
      };
    },
  };
});

async function* createMockStream(chunks: Message[]): AsyncIterable<any> {
  for (const chunk of chunks) {
    yield { type: "content_block_start", content_block: { type: "text", text: "" }, index: 0 };
    const firstBlock = chunk.content[0];
    const text = firstBlock?.type === "text" ? firstBlock.text : "";
    yield { type: "content_block_delta", delta: { type: "text_delta", text }, index: 0 };
    yield { type: "content_block_stop", index: 0 };
    yield { type: "message_delta", delta: {}, usage: chunk.usage };
    yield { type: "message_stop" };
  }
}

class MockStream {
  private message: Message;

  constructor(message: Message) {
    this.message = message;
  }

  async *[Symbol.asyncIterator]() {
    yield { type: "content_block_start", content_block: { type: "text", text: "" }, index: 0 };
    const firstBlock = this.message.content[0];
    const text = firstBlock?.type === "text" ? firstBlock.text : "";
    yield { type: "content_block_delta", delta: { type: "text_delta", text }, index: 0 };
    yield { type: "content_block_stop", index: 0 };
    yield { type: "message_delta", delta: {}, usage: this.message.usage };
    yield { type: "message_stop" };
  }

  async finalMessage(): Promise<Message> {
    return this.message;
  }

  on(_event: string, _callback: any) {
    return this;
  }
}

import { AnthropicProvider } from "../anthropic";
import type { LLMMessage, LLMResponse } from "../types";
import type { LLMTool } from "../provider";

describe("AnthropicProvider", () => {
  describe("constructor", () => {
    test("creates instance with required options", () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });
      expect(provider).toBeDefined();
    });
  });

  describe("complete", () => {
    test("returns response for text message", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [{ role: "user", content: "Hello" }];
      const result = await provider.complete(messages);

      expect(result.message.role).toBe("assistant");
      expect(result.message.content).toBe("Hello! How can I help you?");
      expect(result.finishReason).toBe("stop");
    });

    test("handles tool calls in response", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const tools: LLMTool[] = [
        {
          name: "get_weather",
          description: "Get weather for a city",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
          },
        },
      ];

      const messages: LLMMessage[] = [{ role: "user", content: "What's the weather?" }];
      const result = await provider.complete(messages, tools);

      expect(result.finishReason).toBe("tool_calls");
      expect(result.message.toolCalls).toBeDefined();
      expect(result.message.toolCalls?.[0]?.name).toBe("get_weather");
    });

    test("includes usage information", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [{ role: "user", content: "Hello" }];
      const result = await provider.complete(messages);

      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
    });
  });

  describe("message conversion", () => {
    test("handles system role message", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });

    test("handles developer role message (converted to system)", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [
        { role: "developer", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });

    test("handles both system and developer messages", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [
        { role: "system", content: "System prompt" },
        { role: "developer", content: "Developer prompt" },
        { role: "user", content: "Hello" },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });

    test("handles multimodal content with image", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            { type: "image_url", image_url: { url: "https://example.com/img.png" } },
          ],
        },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });

    test("handles assistant message with tool calls", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "What's the weather?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "toolu_123", name: "get_weather", parameters: { city: "SF" } }],
        },
        { role: "tool", content: '{"temp": 72}', toolCallId: "toolu_123" },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });

    test("handles multiple tool results in user message", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Weather and time?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "toolu_1", name: "get_weather", parameters: { city: "SF" } },
            { id: "toolu_2", name: "get_time", parameters: { city: "SF" } },
          ],
        },
        { role: "tool", content: '{"temp": 72}', toolCallId: "toolu_1" },
        { role: "tool", content: '{"time": "12:00"}', toolCallId: "toolu_2" },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });
  });

  describe("stream", () => {
    test("yields events from stream", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [{ role: "user", content: "Hello" }];
      const events = [];

      for await (const event of provider.stream(messages)) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      const lastEvent = events[events.length - 1];
      expect(lastEvent?.type).toBe("complete");
    });

    test("final event contains complete response", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const messages: LLMMessage[] = [{ role: "user", content: "Hello" }];
      let finalResponse: LLMResponse | undefined;

      for await (const event of provider.stream(messages)) {
        if (event.type === "complete") {
          finalResponse = event.response;
        }
      }

      expect(finalResponse).toBeDefined();
      expect(finalResponse?.message.role).toBe("assistant");
    });
  });

  describe("tool conversion", () => {
    test("converts LLMTool to Anthropic format", async () => {
      const provider = new AnthropicProvider({
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
      });

      const tools: LLMTool[] = [
        {
          name: "get_weather",
          description: "Get current weather",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" },
            },
            required: ["city"],
          },
        },
      ];

      const messages: LLMMessage[] = [{ role: "user", content: "Weather?" }];
      const result = await provider.complete(messages, tools);

      expect(result).toBeDefined();
    });
  });
});
