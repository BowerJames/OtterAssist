export type LLMRole = "user" | "assistant" | "system" | "tool";

export type LLMFinishReason = "stop" | "tool_calls" | "length" | "error";

export interface LLMToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface LLMMessage {
  role: LLMRole;
  content: string;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LLMResponse {
  message: LLMMessage;
  finishReason: LLMFinishReason;
  usage?: LLMUsage;
}

export interface LLMDelta {
  content?: string;
  toolCalls?: Partial<LLMToolCall>[];
}

export type LLMStreamEvent =
  | { type: "delta"; delta: LLMDelta }
  | { type: "complete"; response: LLMResponse };
