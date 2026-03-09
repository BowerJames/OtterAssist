/**
 * Tool to mark an event as completed
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { EventQueue } from "../../types/index.ts";

const parameters = Type.Object({
  eventId: Type.String({
    description: "The ID of the event to mark as completed",
  }),
});

/**
 * Creates the complete_event tool
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
