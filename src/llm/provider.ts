import type { LLMMessage, LLMStreamEvent, LLMResponse } from "./types";

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMProvider {
  complete(messages: LLMMessage[], tools?: LLMTool[]): Promise<LLMResponse>;
  stream(messages: LLMMessage[], tools?: LLMTool[]): AsyncIterable<LLMStreamEvent>;
}
