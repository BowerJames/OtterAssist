export type LLMRole = "user" | "assistant" | "system" | "developer" | "tool";

export type LLMFinishReason = "stop" | "tool_calls" | "length" | "error";

export interface LLMToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface LLMTextPart {
  type: "text";
  text: string;
}

export interface LLMImagePart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface LLMAudioPart {
  type: "input_audio";
  input_audio: {
    data: string;
    format: "wav" | "mp3";
  };
}

export type LLMContentPart = LLMTextPart | LLMImagePart | LLMAudioPart;

export interface LLMMessage {
  role: LLMRole;
  content: string | LLMContentPart[];
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
  content?: string | LLMContentPart[];
  toolCalls?: Partial<LLMToolCall>[];
}

export type LLMStreamEvent =
  | { type: "delta"; delta: LLMDelta }
  | { type: "complete"; response: LLMResponse };
