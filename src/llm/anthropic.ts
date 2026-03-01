import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ContentBlockParam,
  TextBlockParam,
  ImageBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import type { LLMProvider, LLMTool } from "./provider";
import type {
  LLMMessage,
  LLMResponse,
  LLMStreamEvent,
  LLMDelta,
  LLMToolCall,
  LLMContentPart,
  LLMFinishReason,
} from "./types";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens;
  }

  async complete(messages: LLMMessage[], tools?: LLMTool[]): Promise<LLMResponse> {
    try {
      const { system, anthropicMessages } = this.toAnthropicMessages(messages);
      const anthropicTools = tools ? this.toAnthropicTools(tools) : undefined;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      return this.parseResponse(response);
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  async *stream(messages: LLMMessage[], tools?: LLMTool[]): AsyncIterable<LLMStreamEvent> {
    try {
      const { system, anthropicMessages } = this.toAnthropicMessages(messages);
      const anthropicTools = tools ? this.toAnthropicTools(tools) : undefined;

      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: anthropicMessages,
        tools: anthropicTools,
      });

      const accumulatedToolCalls: Map<string, { id: string; name: string; input: string }> = new Map();

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const llmDelta: LLMDelta = {
            content: event.delta.text,
          };
          yield { type: "delta", delta: llmDelta };
        }

        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          const toolBlock = event.content_block;
          accumulatedToolCalls.set(event.index.toString(), {
            id: toolBlock.id,
            name: toolBlock.name,
            input: "",
          });
        }

        if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
          const idx = event.index.toString();
          const accumulated = accumulatedToolCalls.get(idx);
          if (accumulated) {
            accumulated.input += event.delta.partial_json;
            try {
              const parsed = JSON.parse(accumulated.input) as Record<string, unknown>;
              const llmDelta: LLMDelta = {
                toolCalls: [
                  {
                    id: accumulated.id,
                    name: accumulated.name,
                    parameters: parsed,
                  },
                ],
              };
              yield { type: "delta", delta: llmDelta };
            } catch {
              // Partial JSON, skip
            }
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      yield { type: "complete", response: this.parseResponse(finalMessage) };
    } catch (error) {
      yield { type: "complete", response: this.errorResponse(error) };
    }
  }

  private toAnthropicMessages(messages: LLMMessage[]): {
    system: string | undefined;
    anthropicMessages: Anthropic.Messages.MessageParam[];
  } {
    const systemParts: string[] = [];
    const anthropicMessages: Anthropic.Messages.MessageParam[] = [];
    const pendingToolResults: ToolResultBlockParam[] = [];

    for (const msg of messages) {
      if (msg.role === "system" || msg.role === "developer") {
        const content = typeof msg.content === "string" ? msg.content : this.extractTextContent(msg.content);
        if (content) {
          systemParts.push(content);
        }
        continue;
      }

      if (msg.role === "tool") {
        pendingToolResults.push({
          type: "tool_result",
          tool_use_id: msg.toolCallId ?? "",
          content: typeof msg.content === "string" ? msg.content : this.toAnthropicToolResultContent(msg.content),
        });
        continue;
      }

      if (pendingToolResults.length > 0) {
        anthropicMessages.push({
          role: "user",
          content: pendingToolResults,
        });
        pendingToolResults.length = 0;
      }

      if (msg.role === "user") {
        anthropicMessages.push({
          role: "user",
          content: typeof msg.content === "string" ? msg.content : this.toAnthropicContent(msg.content),
        });
      } else if (msg.role === "assistant") {
        const content: ContentBlockParam[] = [];

        if (msg.content) {
          const textContent = typeof msg.content === "string" ? msg.content : this.extractTextContent(msg.content);
          if (textContent) {
            content.push({ type: "text", text: textContent });
          }
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.parameters,
            });
          }
        }

        anthropicMessages.push({
          role: "assistant",
          content: content.length > 0 ? content : "",
        });
      }
    }

    if (pendingToolResults.length > 0) {
      anthropicMessages.push({
        role: "user",
        content: pendingToolResults,
      });
    }

    const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

    return { system, anthropicMessages };
  }

  private extractTextContent(content: LLMContentPart[]): string {
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");
  }

  private toAnthropicContent(content: LLMContentPart[]): ContentBlockParam[] {
    return content.map((part): ContentBlockParam => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "image_url":
          return {
            type: "image",
            source: {
              type: "url",
              url: part.image_url.url,
            },
          };
        case "input_audio":
          return {
            type: "text",
            text: `[Audio input: ${part.input_audio.format}]`,
          };
      }
    });
  }

  private toAnthropicToolResultContent(
    content: LLMContentPart[]
  ): Array<TextBlockParam | ImageBlockParam> {
    return content
      .filter((part): part is { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } =>
        part.type === "text" || part.type === "image_url"
      )
      .map((part): TextBlockParam | ImageBlockParam => {
        if (part.type === "text") {
          return { type: "text", text: part.text };
        }
        return {
          type: "image",
          source: {
            type: "url",
            url: part.image_url.url,
          },
        };
      });
  }

  private toAnthropicTools(tools: LLMTool[]): Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Tool.InputSchema,
    }));
  }

  private parseResponse(response: Message): LLMResponse {
    const toolCalls: LLMToolCall[] = [];
    let textContent = "";

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          parameters: block.input as Record<string, unknown>,
        });
      }
    }

    const finishReason = this.parseStopReason(response.stop_reason, response.stop_sequence);

    return {
      message: {
        role: "assistant",
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finishReason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    };
  }

  private parseStopReason(
    stopReason: string | null | undefined,
    stopSequence: string | null | undefined
  ): LLMFinishReason {
    if (stopSequence !== null && stopSequence !== undefined) {
      return "stop";
    }
    switch (stopReason) {
      case "end_turn":
        return "stop";
      case "tool_use":
        return "tool_calls";
      case "max_tokens":
        return "length";
      default:
        return "error";
    }
  }

  private errorResponse(error: unknown): LLMResponse {
    let message = "Unknown error occurred";

    if (error instanceof Anthropic.APIError) {
      message = `API Error ${error.status}: ${error.message}`;
    } else if (error instanceof Anthropic.APIConnectionError) {
      message = "Network error - check your connection";
    } else if (error instanceof Error) {
      message = error.message;
    }

    return {
      message: { role: "assistant", content: message },
      finishReason: "error",
    };
  }
}
