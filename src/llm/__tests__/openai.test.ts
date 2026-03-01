import { test, expect, describe, beforeEach, mock } from "bun:test";
import type { ChatCompletion } from "openai/resources/chat/completions";

const mockChatCompletion: ChatCompletion = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1234567890,
  model: "gpt-4-turbo",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "Hello! How can I help you?",
        refusal: null,
      },
      finish_reason: "stop",
      logprobs: null,
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
};

const mockToolCallCompletion: ChatCompletion = {
  id: "chatcmpl-tool",
  object: "chat.completion",
  created: 1234567890,
  model: "gpt-4-turbo",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"city":"San Francisco"}',
            },
          },
        ],
      },
      finish_reason: "tool_calls",
      logprobs: null,
    },
  ],
  usage: {
    prompt_tokens: 15,
    completion_tokens: 10,
    total_tokens: 25,
  },
};

mock.module("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: async (params: any) => {
            if (params.stream) {
              return createMockStream([mockChatCompletion]);
            }
            if (params.tools) {
              return mockToolCallCompletion;
            }
            return mockChatCompletion;
          },
        },
      };
    },
  };
});

async function* createMockStream(chunks: ChatCompletion[]): AsyncIterable<ChatCompletion> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

import { OpenAIProvider } from "../openai";
import type { LLMMessage, LLMResponse } from "../types";
import type { LLMTool } from "../provider";

describe("OpenAIProvider", () => {
  describe("constructor", () => {
    test("creates instance with required options", () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
      });
      expect(provider).toBeDefined();
    });

    test("creates instance with custom baseURL", () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        baseURL: "https://api.z.ai/api/coding/paas/v4",
        model: "zai-coding-plan/glm-5",
      });
      expect(provider).toBeDefined();
    });
  });

  describe("complete", () => {
    test("returns response for text message", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
      });

      const messages: LLMMessage[] = [{ role: "user", content: "Hello" }];
      const result = await provider.complete(messages);

      expect(result.message.role).toBe("assistant");
      expect(result.message.content).toBe("Hello! How can I help you?");
      expect(result.finishReason).toBe("stop");
    });

    test("handles tool calls in response", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
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

    test("includes usage information when available", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
      });

      const messages: LLMMessage[] = [{ role: "user", content: "Hello" }];
      const result = await provider.complete(messages);

      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
    });
  });

  describe("message conversion", () => {
    test("handles developer role message", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
      });

      const messages: LLMMessage[] = [
        { role: "developer", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });

    test("handles multimodal content with image", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
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

    test("handles multimodal content with audio", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
      });

      const messages: LLMMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this" },
            { type: "input_audio", input_audio: { data: "base64data", format: "wav" } },
          ],
        },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });

    test("handles assistant message with tool calls", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "What's the weather?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_123", name: "get_weather", parameters: { city: "SF" } }],
        },
        { role: "tool", content: '{"temp": 72}', toolCallId: "call_123" },
      ];

      const result = await provider.complete(messages);
      expect(result).toBeDefined();
    });
  });

  describe("stream", () => {
    test("yields events from stream", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
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
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
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
    test("converts LLMTool to OpenAI format", async () => {
      const provider = new OpenAIProvider({
        apiKey: "test-key",
        model: "gpt-4-turbo",
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
