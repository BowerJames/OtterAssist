/**
 * Custom event management tools for OtterAssist.
 *
 * These tools are provided to the embedded AI agent so it can:
 * - View pending events (list_events)
 * - Track progress on events (update_event_progress)
 * - Mark events as complete (complete_event)
 *
 * The tools are created with a reference to the EventQueue so they
 * can read and update event state.
 *
 * @see AgentRunner - Where these tools are created and registered
 */
export { createCompleteEventTool } from "./complete-event.ts";
export { createListEventsTool } from "./list-events.ts";
export { createUpdateEventProgressTool } from "./update-event-progress.ts";
