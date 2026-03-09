/**
 * Tool to update the progress field of an event
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { EventQueue } from "../../types/index.ts";

const parameters = Type.Object({
  eventId: Type.String({
    description: "The ID of the event to update",
  }),
  progress: Type.String({
    description: "Progress notes describing work done on this event",
  }),
});

/**
 * Creates the update_event_progress tool
 */
export function createUpdateEventProgressTool(
  eventQueue: EventQueue,
): ToolDefinition {
  return {
    name: "update_event_progress",
    label: "Update Event Progress",
    description:
      "Update the progress field of a pending event. Use this to track work done on an event. The progress field stores notes about what has been accomplished.",
    parameters,
    execute: async (
      _toolCallId: string,
      params: Static<typeof parameters>,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) => {
      try {
        await eventQueue.updateProgress(params.eventId, params.progress);

        return {
          content: [
            {
              type: "text" as const,
              text: `Updated progress for event ${params.eventId}: ${params.progress}`,
            },
          ],
          details: { eventId: params.eventId, progress: params.progress },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to update event progress: ${message}`,
            },
          ],
          isError: true,
          details: { error: message },
        };
      }
    },
  };
}
