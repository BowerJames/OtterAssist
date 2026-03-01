export type TriggerType = "manual" | "scheduled" | "webhook" | "file_change";

export interface WebhookTriggerContext {
  type: "webhook";
  source: string;
  payload?: Record<string, unknown>;
}

export interface ScheduledTriggerContext {
  type: "scheduled";
  name: string;
  schedule?: string;
}

export interface FileChangeTriggerContext {
  type: "file_change";
  path: string;
  action: "created" | "modified" | "deleted";
}

export interface ManualTriggerContext {
  type: "manual";
  customInstructions?: string;
}

export type TriggerContext =
  | WebhookTriggerContext
  | ScheduledTriggerContext
  | FileChangeTriggerContext
  | ManualTriggerContext;

export interface ExecutionResult {
  success: boolean;
  finalMessage?: string;
  error?: string;
  trajectoryPath: string;
  iterations: number;
  finishReason: "completed" | "error" | "iteration_limit";
}

export type TrajectoryEntryType =
  | "system_prompt"
  | "trigger_context"
  | "user_instructions"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "error";

export interface TrajectoryEntry {
  timestamp: number;
  type: TrajectoryEntryType;
  content: unknown;
}

export type ExecutorStatus = "pending" | "running" | "completed" | "failed";

export interface ExecutorProgress {
  status: ExecutorStatus;
  iteration: number;
  currentTool?: string;
  message?: string;
}

export interface AgentConfig {
  agentId: string;
  name: string;
  systemPrompt: string;
  llmProvider: string;
  llmModel: string;
  tools: string[];
}

export interface ExecutorOptions {
  maxIterations?: number;
  timeoutPerIteration?: number;
  llmRetryAttempts?: number;
}
