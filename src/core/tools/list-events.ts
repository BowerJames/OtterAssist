/**
 * Tool to list pending events from the queue.
 *
 * This tool allows the AI agent to see all pending events that need
 * to be processed. It's one of the core event management tools provided
 * to the embedded pi agent.
 *
 * @see AgentRunner - Creates and registers this tool
 * @see EventQueue - Source of event data
 */
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { EventQueue } from "../../types/index.ts";

/** Empty parameters schema - list_events takes no arguments */
const parameters = Type.Object({});

/**
 * Creates the list_events tool for use by the AI agent.
 *
 * @param eventQueue - The event queue to query for pending events
 * @returns A ToolDefinition that lists all pending events
 *
 * @example
 * ```typescript
 * const tool = createListEventsTool(eventQueue);
 * // Agent can call: list_events()
 * // Returns: "Pending events (2):\n- [abc123] New issue...\n- [def456] New message..."
 * ```
 */
export function createListEventsTool(eventQueue: EventQueue): ToolDefinition {
  return {
    name: "list_events",
    label: "List Events",
    description:
      "List all pending events from the event queue. Returns an array of events with id, message, progress, createdAt, and status.",
    parameters,
    execute: async (
      _toolCallId: string,
      _params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) => {
      const events = await eventQueue.getPending();

      if (events.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No pending events in the queue.",
            },
          ],
          details: { eventCount: 0 },
        };
      }

      const eventList = events
        .map((e) => {
          const progress = e.progress ? ` (progress: ${e.progress})` : "";
          return `- [${e.id}] ${e.message}${progress}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Pending events (${events.length}):\n${eventList}`,
          },
        ],
        details: { eventCount: events.length, events },
      };
    },
  };
}
