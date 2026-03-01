import type { LLMProvider, LLMTool } from "../llm/provider";
import type { LLMMessage, LLMResponse, LLMToolCall } from "../llm/types";
import type { ToolRegistry } from "../tools/registry";
import type {
  AgentConfig,
  ExecutionResult,
  ExecutorOptions,
  ExecutorProgress,
  TriggerContext,
  TrajectoryEntry,
} from "./types";
import { BASE_SYSTEM_PROMPT, buildTriggerInstructions, buildFullPrompt } from "./prompts";
import { TrajectoryLogger } from "./trajectoryLogger";

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_TIMEOUT_PER_ITERATION = 60000;
const DEFAULT_LLM_RETRY_ATTEMPTS = 3;

export type ProgressCallback = (progress: ExecutorProgress) => void;

export interface ExecutorDependencies {
  llmProvider: LLMProvider;
  toolRegistry: ToolRegistry;
  onProgress?: ProgressCallback;
}

export class AgentExecutor {
  private config: AgentConfig;
  private llmProvider: LLMProvider;
  private toolRegistry: ToolRegistry;
  private options: Required<ExecutorOptions>;
  private onProgress?: ProgressCallback;
  private logger: TrajectoryLogger | null = null;

  constructor(
    config: AgentConfig,
    dependencies: ExecutorDependencies,
    options?: ExecutorOptions
  ) {
    this.config = config;
    this.llmProvider = dependencies.llmProvider;
    this.toolRegistry = dependencies.toolRegistry;
    this.onProgress = dependencies.onProgress;

    this.options = {
      maxIterations: options?.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      timeoutPerIteration: options?.timeoutPerIteration ?? DEFAULT_TIMEOUT_PER_ITERATION,
      llmRetryAttempts: options?.llmRetryAttempts ?? DEFAULT_LLM_RETRY_ATTEMPTS,
    };
  }

  async execute(
    instructions: string,
    triggerContext: TriggerContext,
    agentRunId: string
  ): Promise<ExecutionResult> {
    this.logger = new TrajectoryLogger(agentRunId);

    const triggerInstructions = buildTriggerInstructions(triggerContext);
    const fullSystemPrompt = buildFullPrompt(
      this.config.systemPrompt || BASE_SYSTEM_PROMPT,
      triggerInstructions
    );

    const messages: LLMMessage[] = [
      { role: "system", content: fullSystemPrompt },
    ];

    if (instructions) {
      messages.push({ role: "user", content: instructions });
    }

    await this.logEntry({ type: "system_prompt", content: fullSystemPrompt });
    await this.logEntry({ type: "trigger_context", content: triggerContext });
    if (instructions) {
      await this.logEntry({ type: "user_instructions", content: instructions });
    }

    const tools = this.getToolDefinitions();
    let iterations = 0;
    let finalMessage = "";
    let finishReason: ExecutionResult["finishReason"] = "completed";

    this.reportProgress({ status: "running", iteration: 0 });

    while (iterations < this.options.maxIterations) {
      iterations++;

      try {
        const response = await this.callLLMWithRetry(messages, tools);

        await this.logEntry({
          type: "assistant_message",
          content: {
            role: "assistant",
            content: response.message.content,
            toolCalls: response.message.toolCalls,
            finishReason: response.finishReason,
          },
        });

        if (response.finishReason === "error") {
          const errorMsg =
            typeof response.message.content === "string"
              ? response.message.content
              : "LLM returned an error";
          await this.logEntry({ type: "error", content: errorMsg });
          finishReason = "error";
          break;
        }

        messages.push(response.message);

        if (response.finishReason === "stop") {
          finalMessage =
            typeof response.message.content === "string"
              ? response.message.content
              : "";
          break;
        }

        if (response.finishReason === "tool_calls" && response.message.toolCalls) {
          this.reportProgress({
            status: "running",
            iteration: iterations,
            currentTool: response.message.toolCalls[0]?.name,
          });

          const toolResults = await this.executeTools(response.message.toolCalls);

          for (const result of toolResults) {
            await this.logEntry({ type: "tool_result", content: result });

            messages.push({
              role: "tool",
              toolCallId: result.toolCallId,
              content: result.output ?? result.error ?? "",
            });
          }

          continue;
        }

        if (response.finishReason === "length") {
          finalMessage =
            typeof response.message.content === "string"
              ? response.message.content
              : "";
          finishReason = "completed";
          break;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        await this.logEntry({ type: "error", content: errorMsg });
        finishReason = "error";
        break;
      }
    }

    if (iterations >= this.options.maxIterations) {
      finishReason = "iteration_limit";
    }

    const trajectoryPath = await this.logger.finalize();

    this.reportProgress({
      status: finishReason === "error" ? "failed" : "completed",
      iteration: iterations,
      message: finalMessage,
    });

    return {
      success: finishReason === "completed",
      finalMessage,
      error: finishReason === "error" ? "Execution failed" : undefined,
      trajectoryPath,
      iterations,
      finishReason,
    };
  }

  private async callLLMWithRetry(
    messages: LLMMessage[],
    tools: LLMTool[]
  ): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.llmRetryAttempts; attempt++) {
      try {
        return await this.llmProvider.complete(messages, tools);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown LLM error");

        if (attempt < this.options.llmRetryAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    return {
      message: {
        role: "assistant",
        content: lastError?.message ?? "LLM call failed after retries",
      },
      finishReason: "error",
    };
  }

  private async executeTools(
    toolCalls: LLMToolCall[]
  ): Promise<
    Array<{
      toolCallId: string;
      toolName: string;
      success: boolean;
      output?: string;
      error?: string;
    }>
  > {
    const results: Array<{
      toolCallId: string;
      toolName: string;
      success: boolean;
      output?: string;
      error?: string;
    }> = [];

    for (const toolCall of toolCalls) {
      await this.logEntry({
        type: "tool_call",
        content: {
          id: toolCall.id,
          name: toolCall.name,
          parameters: toolCall.parameters,
        },
      });

      const result = await this.toolRegistry.execute(toolCall.name, toolCall.parameters);

      results.push({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: result.success,
        output: result.output,
        error: result.error,
      });
    }

    return results;
  }

  private getToolDefinitions(): LLMTool[] {
    const enabledTools = this.config.tools;
    const allTools = this.toolRegistry.list();

    if (enabledTools.length === 0) {
      return allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
    }

    return allTools
      .filter((tool) => enabledTools.includes(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
  }

  private async logEntry(entry: Omit<TrajectoryEntry, "timestamp">): Promise<void> {
    if (this.logger) {
      await this.logger.log({
        timestamp: Date.now(),
        ...entry,
      });
    }
  }

  private reportProgress(progress: ExecutorProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }
}
