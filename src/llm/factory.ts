import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";

export type LLMProviderName = "openai" | "anthropic";

export interface LLMProviderConfig {
  provider: LLMProviderName;
  model: string;
}

const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096;

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.provider) {
    case "openai":
      return createOpenAIProvider(config.model);
    case "anthropic":
      return createAnthropicProvider(config.model);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

function createOpenAIProvider(model: string): LLMProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  return new OpenAIProvider({
    apiKey,
    model: model || DEFAULT_OPENAI_MODEL,
  });
}

function createAnthropicProvider(model: string): LLMProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }

  return new AnthropicProvider({
    apiKey,
    model: model || DEFAULT_ANTHROPIC_MODEL,
    maxTokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
  });
}

export function getDefaultModel(provider: LLMProviderName): string {
  switch (provider) {
    case "openai":
      return DEFAULT_OPENAI_MODEL;
    case "anthropic":
      return DEFAULT_ANTHROPIC_MODEL;
    default:
      return DEFAULT_OPENAI_MODEL;
  }
}
