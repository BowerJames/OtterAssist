import { test, expect, describe } from "bun:test";
import type {
  LLMMessage,
  LLMContentPart,
  LLMRole,
  LLMTextPart,
  LLMImagePart,
  LLMAudioPart,
  LLMToolCall,
} from "../types";

describe("LLM Types", () => {
  describe("LLMRole", () => {
    test("includes developer role", () => {
      const role: LLMRole = "developer";
      expect(role).toBe("developer");
    });

    test("includes all standard roles", () => {
      const roles: LLMRole[] = ["user", "assistant", "system", "developer", "tool"];
      expect(roles).toContain("user");
      expect(roles).toContain("assistant");
      expect(roles).toContain("system");
      expect(roles).toContain("developer");
      expect(roles).toContain("tool");
    });
  });

  describe("LLMMessage", () => {
    test("accepts string content", () => {
      const msg: LLMMessage = { role: "user", content: "Hello" };
      expect(msg.content).toBe("Hello");
    });

    test("accepts content parts array", () => {
      const msg: LLMMessage = {
        role: "user",
        content: [
          { type: "text", text: "What's this?" },
          { type: "image_url", image_url: { url: "https://example.com/img.png" } },
        ],
      };
      expect(Array.isArray(msg.content)).toBe(true);
    });

    test("accepts developer role with string content", () => {
      const msg: LLMMessage = {
        role: "developer",
        content: "You are a helpful assistant.",
      };
      expect(msg.role).toBe("developer");
    });

    test("accepts tool role with toolCallId", () => {
      const msg: LLMMessage = {
        role: "tool",
        content: '{"result": 42}',
        toolCallId: "call_123",
      };
      expect(msg.role).toBe("tool");
      expect(msg.toolCallId).toBe("call_123");
    });

    test("accepts assistant message with tool calls", () => {
      const msg: LLMMessage = {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_123", name: "get_weather", parameters: { city: "SF" } },
        ],
      };
      expect(msg.toolCalls).toBeDefined();
      expect(msg.toolCalls?.length).toBe(1);
    });
  });

  describe("LLMTextPart", () => {
    test("creates text content part", () => {
      const part: LLMTextPart = { type: "text", text: "Hello" };
      expect(part.type).toBe("text");
      expect(part.text).toBe("Hello");
    });
  });

  describe("LLMImagePart", () => {
    test("creates image content part with url only", () => {
      const part: LLMImagePart = {
        type: "image_url",
        image_url: { url: "https://example.com/img.png" },
      };
      expect(part.type).toBe("image_url");
      expect(part.image_url.url).toBe("https://example.com/img.png");
    });

    test("creates image content part with detail option", () => {
      const part: LLMImagePart = {
        type: "image_url",
        image_url: { url: "https://example.com/img.png", detail: "high" },
      };
      expect(part.image_url.detail).toBe("high");
    });

    test("accepts all detail levels", () => {
      const details: Array<"auto" | "low" | "high"> = ["auto", "low", "high"];
      details.forEach((detail) => {
        const part: LLMImagePart = {
          type: "image_url",
          image_url: { url: "https://example.com/img.png", detail },
        };
        expect(part.image_url.detail).toBe(detail);
      });
    });
  });

  describe("LLMAudioPart", () => {
    test("creates audio content part", () => {
      const part: LLMAudioPart = {
        type: "input_audio",
        input_audio: { data: "base64data", format: "wav" },
      };
      expect(part.type).toBe("input_audio");
      expect(part.input_audio.format).toBe("wav");
    });

    test("accepts mp3 format", () => {
      const part: LLMAudioPart = {
        type: "input_audio",
        input_audio: { data: "base64data", format: "mp3" },
      };
      expect(part.input_audio.format).toBe("mp3");
    });
  });

  describe("LLMContentPart", () => {
    test("accepts text part", () => {
      const part: LLMContentPart = { type: "text", text: "Hello" };
      expect(part.type).toBe("text");
    });

    test("accepts image part", () => {
      const part: LLMContentPart = {
        type: "image_url",
        image_url: { url: "https://example.com/img.png" },
      };
      expect(part.type).toBe("image_url");
    });

    test("accepts audio part", () => {
      const part: LLMContentPart = {
        type: "input_audio",
        input_audio: { data: "base64data", format: "wav" },
      };
      expect(part.type).toBe("input_audio");
    });
  });

  describe("LLMToolCall", () => {
    test("creates tool call with parameters", () => {
      const tc: LLMToolCall = {
        id: "call_123",
        name: "get_weather",
        parameters: { city: "San Francisco", unit: "celsius" },
      };
      expect(tc.id).toBe("call_123");
      expect(tc.name).toBe("get_weather");
      expect(tc.parameters.city).toBe("San Francisco");
    });

    test("accepts empty parameters", () => {
      const tc: LLMToolCall = {
        id: "call_456",
        name: "noop",
        parameters: {},
      };
      expect(tc.parameters).toEqual({});
    });
  });
});
