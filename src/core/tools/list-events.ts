/**
 * Tool to list pending events from the queue
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import type { EventQueue } from "../../types/index.ts";

const parameters = Type.Object({});

/**
 * Creates the list_events tool
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
