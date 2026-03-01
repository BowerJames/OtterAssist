import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import type { AgentExecutor, ExecutorDependencies, ProgressCallback } from "../agent/executor";
import type { AgentConfig, TriggerContext } from "../agent/types";
import type { LLMProvider } from "../llm/provider";
import type { ToolRegistry } from "../tools/registry";
import { getConvexUrl } from "../tools/env";

const DEFAULT_POLL_INTERVAL_MS = 1000;

export interface EventProcessorConfig {
  pollIntervalMs?: number;
}

export interface EventProcessorDependencies {
  createLLMProvider: (provider: string, model: string) => LLMProvider;
  createToolRegistry: () => ToolRegistry;
  onProgress?: ProgressCallback;
}

interface Event {
  _id: Id<"events">;
  type: string;
  payload?: Record<string, unknown>;
  agentId?: Id<"agents">;
  status: string;
  createdAt: number;
}

interface Agent {
  _id: Id<"agents">;
  name: string;
  systemPrompt: string;
  llmProvider: string;
  llmModel: string;
  tools: string[];
  isActive: boolean;
}

interface AgentRun {
  _id: Id<"agentRuns">;
  agentId: Id<"agents">;
  status: string;
}

type AgentExecutorClass = new (
  config: AgentConfig,
  dependencies: ExecutorDependencies,
  options?: Record<string, unknown>
) => AgentExecutor;

let AgentExecutorImport: AgentExecutorClass | null = null;

async function getAgentExecutorClass(): Promise<AgentExecutorClass> {
  if (!AgentExecutorImport) {
    const module = await import("../agent/executor");
    AgentExecutorImport = module.AgentExecutor;
  }
  return AgentExecutorImport;
}

export class EventProcessor {
  private convexClient: ConvexHttpClient;
  private createLLMProvider: EventProcessorDependencies["createLLMProvider"];
  private createToolRegistry: EventProcessorDependencies["createToolRegistry"];
  private onProgress?: ProgressCallback;
  private pollIntervalMs: number;
  private running: boolean = false;
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private processing: boolean = false;

  constructor(dependencies: EventProcessorDependencies, config?: EventProcessorConfig) {
    this.convexClient = new ConvexHttpClient(getConvexUrl());
    this.createLLMProvider = dependencies.createLLMProvider;
    this.createToolRegistry = dependencies.createToolRegistry;
    this.onProgress = dependencies.onProgress;
    this.pollIntervalMs = config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.schedulePoll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
  }

  private schedulePoll(): void {
    if (!this.running) {
      return;
    }
    this.pollTimeoutId = setTimeout(() => {
      this.poll().catch((error) => {
        console.error("EventProcessor poll error:", error);
      });
    }, this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.processing) {
      this.schedulePoll();
      return;
    }

    this.processing = true;
    try {
      await this.processNext();
    } finally {
      this.processing = false;
      this.schedulePoll();
    }
  }

  async processNext(): Promise<boolean> {
    const event = await this.claimNextEvent();
    if (!event) {
      return false;
    }

    try {
      await this.processEvent(event);
      return true;
    } catch (error) {
      console.error(`Failed to process event ${event._id}:`, error);
      await this.markEventFailed(event._id, error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  }

  private async claimNextEvent(): Promise<Event | null> {
    return await this.convexClient.mutation(api.events.claimNextEvent, {});
  }

  private async processEvent(event: Event): Promise<void> {
    if (!event.agentId) {
      await this.markEventProcessed(event._id);
      return;
    }

    const agent = await this.convexClient.query(api.agents.getAgentInternal, {
      agentId: event.agentId,
    });

    if (!agent) {
      await this.markEventFailed(event._id, `Agent not found: ${event.agentId}`);
      return;
    }

    const runId = await this.convexClient.mutation(api.agentRuns.createRunInternal, {
      agentId: agent._id,
      triggerType: "event",
      triggerData: { eventId: event._id, eventType: event.type },
      instructions: this.buildInstructions(event),
    });

    await this.convexClient.mutation(api.agentRuns.updateRunStatusInternal, {
      runId,
      status: "running",
    });

    try {
      const result = await this.executeAgent(agent, event, runId);

      if (result.success) {
        await this.convexClient.mutation(api.agentRuns.setRunCompletedInternal, {
          runId,
          trajectoryPath: result.trajectoryPath,
        });
        await this.markEventProcessed(event._id);
      } else {
        await this.convexClient.mutation(api.agentRuns.setRunErrorInternal, {
          runId,
          error: result.error ?? "Execution failed",
        });
        await this.markEventFailed(event._id, result.error ?? "Execution failed");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.convexClient.mutation(api.agentRuns.setRunErrorInternal, {
        runId,
        error: errorMessage,
      });
      await this.markEventFailed(event._id, errorMessage);
    }
  }

  private async executeAgent(
    agent: Agent,
    event: Event,
    _runId: Id<"agentRuns">
  ): Promise<{ success: boolean; error?: string; trajectoryPath: string }> {
    const AgentExecutorClass = await getAgentExecutorClass();
    const llmProvider = this.createLLMProvider(agent.llmProvider, agent.llmModel);
    const toolRegistry = this.createToolRegistry();

    const config: AgentConfig = {
      agentId: agent._id,
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      llmProvider: agent.llmProvider,
      llmModel: agent.llmModel,
      tools: agent.tools,
    };

    const executor = new AgentExecutorClass(config, {
      llmProvider,
      toolRegistry,
      onProgress: this.onProgress,
    });

    const triggerContext = this.buildTriggerContext(event);
    const instructions = this.buildInstructions(event);

    return await executor.execute(instructions, triggerContext, _runId);
  }

  private buildTriggerContext(event: Event): TriggerContext {
    const payload = event.payload ?? {};

    if (event.type.startsWith("webhook.")) {
      return {
        type: "webhook",
        source: (payload.source as string) ?? "unknown",
        payload: payload as Record<string, unknown>,
      };
    }

    if (event.type === "scheduled") {
      return {
        type: "scheduled",
        name: (payload.scheduleName as string) ?? "default",
        schedule: payload.schedule as string | undefined,
      };
    }

    if (event.type.startsWith("file_")) {
      return {
        type: "file_change",
        path: (payload.path as string) ?? "",
        action: this.extractFileAction(event.type),
      };
    }

    return {
      type: "manual",
      customInstructions: payload.instructions as string | undefined,
    };
  }

  private extractFileAction(eventType: string): "created" | "modified" | "deleted" {
    if (eventType === "file_created") return "created";
    if (eventType === "file_modified") return "modified";
    if (eventType === "file_deleted") return "deleted";
    return "modified";
  }

  private buildInstructions(event: Event): string {
    const payload = event.payload ?? {};

    if (event.type.startsWith("webhook.")) {
      const source = payload.source ?? "unknown";
      return `A webhook was received from ${source}. Check the payload and respond appropriately.`;
    }

    if (event.type === "scheduled") {
      return payload.instructions as string ?? "Scheduled task triggered. Perform your configured tasks.";
    }

    if (event.type === "file_created") {
      return `A new file was created at ${(payload.path as string) ?? "unknown path"}. Review and process it if needed.`;
    }

    if (event.type === "file_modified") {
      return `A file was modified at ${(payload.path as string) ?? "unknown path"}. Review the changes if needed.`;
    }

    if (event.type === "file_deleted") {
      return `A file was deleted at ${(payload.path as string) ?? "unknown path"}. Take note if relevant.`;
    }

    return (payload.instructions as string) ?? "Process this event.";
  }

  private async markEventProcessed(eventId: Id<"events">): Promise<void> {
    await this.convexClient.mutation(api.events.markEventProcessed, { eventId });
  }

  private async markEventFailed(eventId: Id<"events">, error: string): Promise<void> {
    await this.convexClient.mutation(api.events.markEventFailed, { eventId });
    console.error(`Event ${eventId} failed:`, error);
  }
}
