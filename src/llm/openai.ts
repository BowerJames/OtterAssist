import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageFunctionToolCall,
} from "openai/resources/chat/completions";
import type * as Shared from "openai/resources/shared";
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

export interface OpenAIProviderOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.model = options.model;
  }

  async complete(messages: LLMMessage[], tools?: LLMTool[]): Promise<LLMResponse> {
    try {
      const openaiMessages = this.toOpenAIMessages(messages);
      const openaiTools = tools ? this.toOpenAITools(tools) : undefined;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        tools: openaiTools,
      });

      return this.parseResponse(response);
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  async *stream(messages: LLMMessage[], tools?: LLMTool[]): AsyncIterable<LLMStreamEvent> {
    try {
      const openaiMessages = this.toOpenAIMessages(messages);
      const openaiTools = tools ? this.toOpenAITools(tools) : undefined;

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        tools: openaiTools,
        stream: true,
      });

      let accumulatedContent = "";
      const accumulatedToolCalls: Map<number, { id: string; name: string; arguments: string }> =
        new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        const llmDelta: LLMDelta = {};

        if (delta.content) {
          accumulatedContent += delta.content;
          llmDelta.content = delta.content;
        }

        if (delta.tool_calls) {
          llmDelta.toolCalls = [];
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            let accumulated = accumulatedToolCalls.get(idx);
            if (!accumulated) {
              accumulated = { id: "", name: "", arguments: "" };
              accumulatedToolCalls.set(idx, accumulated);
            }
            if (tc.id) accumulated.id = tc.id;
            if (tc.function?.name) accumulated.name = tc.function.name;
            if (tc.function?.arguments) accumulated.arguments += tc.function.arguments;

            llmDelta.toolCalls.push({
              id: tc.id || accumulated.id,
              name: tc.function?.name || accumulated.name,
              parameters: accumulated.arguments
                ? (JSON.parse(accumulated.arguments) as Record<string, unknown>)
                : undefined,
            });
          }
        }

        if (llmDelta.content || llmDelta.toolCalls) {
          yield { type: "delta", delta: llmDelta };
        }
      }

      const toolCalls: LLMToolCall[] = [];
      for (const [, accumulated] of accumulatedToolCalls) {
        if (accumulated.id && accumulated.name) {
          toolCalls.push({
            id: accumulated.id,
            name: accumulated.name,
            parameters: accumulated.arguments
              ? (JSON.parse(accumulated.arguments) as Record<string, unknown>)
              : {},
          });
        }
      }

      const finishReason: LLMFinishReason = toolCalls.length > 0 ? "tool_calls" : "stop";

      const response: LLMResponse = {
        message: {
          role: "assistant",
          content: accumulatedContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finishReason,
      };

      yield { type: "complete", response };
    } catch (error) {
      yield { type: "complete", response: this.errorResponse(error) };
    }
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    return messages.map((msg) => this.toOpenAIMessage(msg));
  }

  private toOpenAIMessage(msg: LLMMessage): ChatCompletionMessageParam {
    const content = this.toOpenAIContent(msg.content);

    switch (msg.role) {
      case "system":
        return { role: "system", content: content as string };
      case "developer":
        return { role: "developer", content: content as string };
      case "user":
        return { role: "user", content };
      case "assistant":
        return {
          role: "assistant",
          content: content as string | null,
          tool_calls: msg.toolCalls?.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.parameters),
            },
          })),
        };
      case "tool":
        return {
          role: "tool",
          tool_call_id: msg.toolCallId ?? "",
          content: content as string,
        };
    }
  }

  private toOpenAIContent(content: string | LLMContentPart[]): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    if (typeof content === "string") {
      return content;
    }
    return content.map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text" as const, text: part.text };
        case "image_url":
          return {
            type: "image_url" as const,
            image_url: {
              url: part.image_url.url,
              detail: part.image_url.detail,
            },
          };
        case "input_audio":
          return {
            type: "input_audio" as const,
            input_audio: {
              data: part.input_audio.data,
              format: part.input_audio.format,
            },
          };
      }
    });
  }

  private toOpenAITools(tools: LLMTool[]): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Shared.FunctionParameters,
      },
    }));
  }

  private parseResponse(response: ChatCompletion): LLMResponse {
    const choice = response.choices[0];
    if (!choice) {
      return {
        message: { role: "assistant", content: "" },
        finishReason: "error",
      };
    }

    const message = choice.message;
    const functionToolCalls = message.tool_calls?.filter(
      (tc): tc is ChatCompletionMessageFunctionToolCall => tc.type === "function"
    );
    const toolCalls: LLMToolCall[] | undefined = functionToolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      parameters: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    const finishReason = this.parseFinishReason(choice.finish_reason);

    return {
      message: {
        role: "assistant",
        content: message.content || "",
        toolCalls,
      },
      finishReason,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  private parseFinishReason(reason: string | null | undefined): LLMFinishReason {
    switch (reason) {
      case "stop":
        return "stop";
      case "tool_calls":
        return "tool_calls";
      case "length":
        return "length";
      default:
        return "error";
    }
  }

  private errorResponse(error: unknown): LLMResponse {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return {
      message: { role: "assistant", content: message },
      finishReason: "error",
    };
  }
}
