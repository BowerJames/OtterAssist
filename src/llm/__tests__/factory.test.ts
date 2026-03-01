import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { createLLMProvider, getDefaultModel } from "../factory";
import { OpenAIProvider } from "../openai";
import { AnthropicProvider } from "../anthropic";

describe("createLLMProvider", () => {
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalZAIKey = process.env.ZAI_CODING_PLAN_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.ZAI_CODING_PLAN_API_KEY = "test-zai-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    process.env.ZAI_CODING_PLAN_API_KEY = originalZAIKey;
  });

  describe("openai", () => {
    test("creates OpenAIProvider with default model", () => {
      const provider = createLLMProvider({ provider: "openai", model: "" });
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    test("creates OpenAIProvider with custom model", () => {
      const provider = createLLMProvider({ provider: "openai", model: "gpt-4-turbo" });
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    test("throws when OPENAI_API_KEY is not set", () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => createLLMProvider({ provider: "openai", model: "" })).toThrow(
        "OPENAI_API_KEY environment variable is not set"
      );
    });
  });

  describe("anthropic", () => {
    test("creates AnthropicProvider with default model", () => {
      const provider = createLLMProvider({ provider: "anthropic", model: "" });
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    test("creates AnthropicProvider with custom model", () => {
      const provider = createLLMProvider({ provider: "anthropic", model: "claude-3-opus" });
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    test("throws when ANTHROPIC_API_KEY is not set", () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(() => createLLMProvider({ provider: "anthropic", model: "" })).toThrow(
        "ANTHROPIC_API_KEY environment variable is not set"
      );
    });
  });

  describe("zai-coding-plan", () => {
    test("creates OpenAIProvider (ZAI uses OpenAI-compatible API)", () => {
      const provider = createLLMProvider({ provider: "zai-coding-plan", model: "" });
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    test("creates OpenAIProvider with custom model", () => {
      const provider = createLLMProvider({ provider: "zai-coding-plan", model: "glm-4" });
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    test("throws when ZAI_CODING_PLAN_API_KEY is not set", () => {
      delete process.env.ZAI_CODING_PLAN_API_KEY;
      expect(() => createLLMProvider({ provider: "zai-coding-plan", model: "" })).toThrow(
        "ZAI_CODING_PLAN_API_KEY environment variable is not set"
      );
    });
  });

  test("throws for unknown provider", () => {
    expect(() =>
      createLLMProvider({ provider: "unknown" as any, model: "" })
    ).toThrow("Unknown LLM provider: unknown");
  });
});

describe("getDefaultModel", () => {
  test("returns gpt-4o for openai", () => {
    expect(getDefaultModel("openai")).toBe("gpt-4o");
  });

  test("returns claude-sonnet-4-20250514 for anthropic", () => {
    expect(getDefaultModel("anthropic")).toBe("claude-sonnet-4-20250514");
  });

  test("returns glm-5 for zai-coding-plan", () => {
    expect(getDefaultModel("zai-coding-plan")).toBe("glm-5");
  });
});
