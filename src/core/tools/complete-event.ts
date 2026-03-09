/**
 * Tool to mark an event as completed.
 *
 * This tool allows the AI agent to mark events as complete after
 * processing them. Completed events are removed from the pending queue
 * and will not be processed again.
 *
 * The agent should only call this when it has fully resolved an event.
 * If the agent makes partial progress, it should use update_event_progress
 * instead and leave the event pending.
 *
 * @see AgentRunner - Creates and registers this tool
 * @see EventQueue - Where events are stored and updated
 */
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { EventQueue } from "../../types/index.ts";

/** Parameters schema for complete_event tool */
const parameters = Type.Object({
  eventId: Type.String({
    description: "The ID of the event to mark as completed",
  }),
});

/**
 * Creates the complete_event tool for use by the AI agent.
 *
 * @param eventQueue - The event queue to update
 * @returns A ToolDefinition that marks an event as completed
 *
 * @example
 * ```typescript
 * const tool = createCompleteEventTool(eventQueue);
 * // Agent can call: complete_event({ eventId: "abc-123-def" })
 * // Returns: "Marked event abc-123-def as completed: \"New issue...\""
 * ```
 */
export function createCompleteEventTool(
  eventQueue: EventQueue,
): ToolDefinition {
  return {
    name: "complete_event",
    label: "Complete Event",
    description:
      "Mark an event as completed. Only call this when you have fully resolved the event. Completed events are removed from the pending queue.",
    parameters,
    execute: async (
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) => {
      try {
        // Verify the event exists
        const event = await eventQueue.getById(params.eventId);
        if (!event) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Event not found: ${params.eventId}`,
              },
            ],
            isError: true,
            details: { error: "Event not found" },
          };
        }

        if (event.status === "completed") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Event ${params.eventId} is already completed.`,
              },
            ],
            details: { eventId: params.eventId, alreadyCompleted: true },
          };
        }

        await eventQueue.markComplete(params.eventId);

        return {
          content: [
            {
              type: "text" as const,
              text: `Marked event ${params.eventId} as completed: "${event.message}"`,
            },
          ],
          details: { eventId: params.eventId, completed: true },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to complete event: ${message}`,
            },
          ],
          isError: true,
          details: { error: message },
        };
      }
    },
  };
}
