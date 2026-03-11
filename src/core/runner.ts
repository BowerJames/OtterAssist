/**
 * Agent Runner - pi SDK integration for running AI agents
 * @see Issue #7
 * @see Issue #23 (pi extension integration)
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  type ExtensionFactory,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { Event, EventQueue, Logger } from "../types/index.ts";
import {
  createCompleteEventTool,
  createListEventsTool,
  createUpdateEventProgressTool,
} from "./tools/index.ts";

/** Default agent directory for OtterAssist */
export const DEFAULT_AGENT_DIR = join(homedir(), ".otterassist", "agent");

/** Wrap up prompt content for the /wrap_up command */
export const WRAP_UP_PROMPT = `---
description: Wrap up the current session and update event progress
---
You must wrap up now. Please stop handling the event(s) immediately. Complete the wrap up process by:

1. Marking all events that have been completely handled as complete.
2. Updating the progress on all events that have been partially worked on. If there is already progress update it with a full holistic view that includes both the past progress and the current progress, do not just overwrite it with what you have done in this session.
3. Events that you were unable to make progress on just leave untouched.

Once you have done this you can stop.
`;

/** Filename for the wrap_up prompt template */
const WRAP_UP_FILENAME = "wrap_up.md";

/**
 * Gets the path to the wrap_up prompt file.
 *
 * @param agentDir - The agent directory path (e.g., ~/.otterassist/agent)
 * @returns The full path to wrap_up.md
 */
export function getWrapUpPromptPath(agentDir: string): string {
  return join(agentDir, "prompts", WRAP_UP_FILENAME);
}

/**
 * Gets the current wrap_up prompt content.
 * Returns the default prompt if the file doesn't exist yet.
 *
 * @param agentDir - The agent directory path (e.g., ~/.otterassist/agent)
 * @returns The wrap_up prompt content
 */
export async function getWrapUpPrompt(agentDir: string): Promise<string> {
  const wrapUpPath = getWrapUpPromptPath(agentDir);
  const file = Bun.file(wrapUpPath);
  const exists = await file.exists();

  if (!exists) {
    return WRAP_UP_PROMPT;
  }

  return await file.text();
}

/**
 * Sets the wrap_up prompt content.
 * Creates the prompts directory if it doesn't exist.
 *
 * @param agentDir - The agent directory path (e.g., ~/.otterassist/agent)
 * @param content - The new wrap_up prompt content
 */
export async function setWrapUpPrompt(
  agentDir: string,
  content: string,
): Promise<void> {
  const promptsDir = join(agentDir, "prompts");
  const wrapUpPath = getWrapUpPromptPath(agentDir);

  // Create prompts directory if it doesn't exist
  await mkdir(promptsDir, { recursive: true });

  // Write the wrap_up prompt
  await Bun.write(wrapUpPath, content);
}

/**
 * Ensures the wrap_up prompt template exists in the agent directory.
 * Creates the prompts directory and wrap_up.md file if they don't exist.
 *
 * @param agentDir - The agent directory path (e.g., ~/.otterassist/agent)
 * @param logger - Optional logger for debug output
 */
export async function ensureWrapUpPrompt(
  agentDir: string,
  logger?: Logger,
): Promise<void> {
  const promptsDir = join(agentDir, "prompts");
  const wrapUpPath = join(promptsDir, WRAP_UP_FILENAME);

  try {
    // Create prompts directory if it doesn't exist
    await mkdir(promptsDir, { recursive: true });

    // Check if wrap_up.md already exists
    const file = Bun.file(wrapUpPath);
    const exists = await file.exists();

    if (!exists) {
      // Write the wrap_up prompt template
      await Bun.write(wrapUpPath, WRAP_UP_PROMPT);
      logger?.debug(`Created wrap_up prompt template at ${wrapUpPath}`);
    }
  } catch (error) {
    // Log warning but don't fail - the agent can still run without the prompt
    logger?.warn(
      `Failed to ensure wrap_up prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/** System prompt for the OtterAssist agent */
const OTTERASSIST_SYSTEM_PROMPT = `You are OtterAssist, an AI agent that processes events from a queue. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files
- list_events: List all pending events from the queue
- update_event_progress: Update the progress notes on an event
- complete_event: Mark an event as completed

Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files before editing. You must use this tool instead of cat or sed.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files

Event Processing:
- Always start by listing events to see what needs to be done
- Work through events one at a time
- Update progress on events as you work to track what you've done
- Only mark an event complete when it is fully resolved
- If you cannot complete an event, leave it pending with progress notes explaining why
- Events stay pending on failure, so be thorough and don't abandon work

Extension Skills:
- Extensions may provide additional skills for handling specific event types
- Check available skills when you encounter events that need specialized handling
- Skills provide context and instructions for working with specific systems`;

/**
 * Options for creating an AgentRunner
 */
export interface AgentRunnerOptions {
  /** Event queue for reading/updating events */
  eventQueue: EventQueue;
  /** Logger for debug/info output */
  logger: Logger;
  /** Working directory for the agent (default: process.cwd()) */
  cwd?: string;
  /** Agent directory for extensions, skills, etc. (default: ~/.otterassist/agent) */
  agentDir?: string;
  /**
   * Pi extension factories from OtterAssist extensions.
   * These are passed to the pi agent to register tools, skills, hooks, etc.
   * @see Issue #23
   */
  piExtensionFactories?: ExtensionFactory[];
}

/**
 * Result of an agent run
 */
export interface AgentRunResult {
  /** Events that were processed during this run */
  eventsProcessed: Event[];
  /** Whether the run completed successfully */
  success: boolean;
  /** Error message if the run failed */
  error?: string;
}

/**
 * Interface for running agents - allows for easy mocking in tests
 */
export interface Runner {
  /** Runs the agent to process pending events */
  run(events: Event[]): Promise<AgentRunResult>;
}

/**
 * Agent runner that uses the pi SDK to process events.
 *
 * Supports pi extension factories from OtterAssist extensions, allowing
 * extensions to register tools, skills, and hooks with the embedded agent.
 */
export class AgentRunner {
  private readonly eventQueue: EventQueue;
  private readonly logger: Logger;
  private readonly cwd: string;
  private readonly agentDir: string;
  private readonly piExtensionFactories: ExtensionFactory[];

  constructor(options: AgentRunnerOptions) {
    this.eventQueue = options.eventQueue;
    this.logger = options.logger;
    this.cwd = options.cwd ?? process.cwd();
    this.agentDir = options.agentDir ?? DEFAULT_AGENT_DIR;
    this.piExtensionFactories = options.piExtensionFactories ?? [];
  }

  /**
   * Runs the agent to process pending events
   * @param events - The pending events to process (passed as context)
   * @returns Result of the agent run
   */
  async run(events: Event[]): Promise<AgentRunResult> {
    // Ensure wrap_up prompt template exists
    await ensureWrapUpPrompt(this.agentDir, this.logger);

    if (events.length === 0) {
      this.logger.debug("No events to process");
      return { eventsProcessed: [], success: true };
    }

    this.logger.info(`Starting agent run with ${events.length} event(s)`);

    if (this.piExtensionFactories.length > 0) {
      this.logger.info(
        `Loading ${this.piExtensionFactories.length} pi extension(s)`,
      );
    }

    try {
      // Set up auth and model registry
      const authStorage = AuthStorage.create(join(this.agentDir, "auth.json"));
      const modelRegistry = new ModelRegistry(authStorage);

      // Create custom event management tools
      const eventTools = [
        createListEventsTool(this.eventQueue),
        createUpdateEventProgressTool(this.eventQueue),
        createCompleteEventTool(this.eventQueue),
      ];

      // Create coding tools with the correct cwd
      const codingTools = createCodingTools(this.cwd);

      // Set up resource loader with custom agent directory and pi extensions
      const resourceLoader = new DefaultResourceLoader({
        cwd: this.cwd,
        agentDir: this.agentDir,
        systemPromptOverride: () => OTTERASSIST_SYSTEM_PROMPT,
        // Pass OtterAssist extension's pi extension factories
        extensionFactories: this.piExtensionFactories,
      });
      await resourceLoader.reload();

      // In-memory settings (no persistence needed for event processing)
      const settingsManager = SettingsManager.inMemory();

      // Create the agent session
      const { session, extensionsResult } = await createAgentSession({
        cwd: this.cwd,
        agentDir: this.agentDir,
        tools: codingTools,
        customTools: eventTools,
        resourceLoader,
        sessionManager: SessionManager.inMemory(),
        settingsManager,
        authStorage,
        modelRegistry,
      });

      // Log extension loading results
      if (extensionsResult.extensions.length > 0) {
        this.logger.debug(
          `Loaded ${extensionsResult.extensions.length} pi extension(s)`,
        );
      }
      if (extensionsResult.errors.length > 0) {
        for (const error of extensionsResult.errors) {
          this.logger.warn(`Pi extension error: ${error.error}`);
        }
      }

      // Subscribe to events for logging
      session.subscribe((event) => {
        this.handleSessionEvent(event);
      });

      // Build the initial prompt with event context
      const eventContext = this.buildEventContext(events);
      const prompt = `${eventContext}

Process these events. Start by listing the events, then work through them one at a time. Update progress as you work and mark events complete when resolved.`;

      // Run the agent
      await session.prompt(prompt);

      this.logger.info("Agent run completed");

      return {
        eventsProcessed: events,
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Agent run failed:", error);

      return {
        eventsProcessed: events,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Builds the event context string for the agent prompt
   */
  private buildEventContext(events: Event[]): string {
    const eventList = events
      .map((e) => {
        const progress = e.progress ? `\n  Progress: ${e.progress}` : "";
        const created = e.createdAt.toLocaleString();
        return `- [${e.id}] (created: ${created})\n  Message: ${e.message}${progress}`;
      })
      .join("\n\n");

    return `You have ${events.length} pending event(s) to process:

${eventList}`;
  }

  /**
   * Handles session events for logging
   */
  private handleSessionEvent(event: unknown): void {
    const e = event as Record<string, unknown>;

    switch (e.type) {
      case "message_update": {
        const msgEvent = e as {
          assistantMessageEvent?: { type?: string; delta?: string };
        };
        if (msgEvent.assistantMessageEvent?.type === "text_delta") {
          this.logger.debug(`[Agent] ${msgEvent.assistantMessageEvent.delta}`);
        }
        break;
      }

      case "tool_execution_start": {
        const toolEvent = e as { toolName?: string };
        this.logger.debug(`[Tool] Starting: ${toolEvent.toolName}`);
        break;
      }

      case "tool_execution_end": {
        const toolEvent = e as { toolName?: string; isError?: boolean };
        const status = toolEvent.isError ? "error" : "success";
        this.logger.debug(`[Tool] Finished: ${toolEvent.toolName} (${status})`);
        break;
      }

      case "agent_start":
        this.logger.debug("[Agent] Started processing");
        break;

      case "agent_end":
        this.logger.debug("[Agent] Finished processing");
        break;
    }
  }
}
