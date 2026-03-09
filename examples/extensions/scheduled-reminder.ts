/**
 * Scheduled Reminder Extension
 *
 * Creates reminder events at specific times.
 * Demonstrates state management and time-based event generation.
 *
 * Features:
 * - Configure reminders with specific times and messages
 * - Recurring reminders (daily, weekly)
 * - One-time reminders
 * - Tracks which reminders have been triggered
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { OtterAssistExtension, OAExtensionContext } from "otterassist";

interface Reminder {
  id: string;
  message: string;
  time: string; // HH:MM format
  days?: number[]; // 0=Sunday, 1=Monday, etc. Undefined = every day
  lastTriggered?: string; // ISO date string
}

interface ScheduledReminderConfig {
  reminders: Reminder[];
}

let config: ScheduledReminderConfig;
let logger: OAExtensionContext["logger"];

/**
 * Get current time in HH:MM format
 */
function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * Get current day of week (0=Sunday)
 */
function getCurrentDay(): number {
  return new Date().getDay();
}

/**
 * Get today's date as YYYY-MM-DD
 */
function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Check if a reminder should trigger now
 */
function shouldTrigger(reminder: Reminder): boolean {
  const currentTime = getCurrentTime();
  const currentDay = getCurrentDay();
  const today = getTodayDate();

  // Check time match
  if (reminder.time !== currentTime) {
    return false;
  }

  // Check if already triggered today
  if (reminder.lastTriggered === today) {
    return false;
  }

  // Check day of week
  if (reminder.days !== undefined && !reminder.days.includes(currentDay)) {
    return false;
  }

  return true;
}

/**
 * Mark a reminder as triggered
 */
function markTriggered(reminder: Reminder): void {
  reminder.lastTriggered = getTodayDate();
}

/**
 * Format days for display
 */
function formatDays(days?: number[]): string {
  if (days === undefined) return "every day";

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.map((d) => dayNames[d]).join(", ");
}

export default {
  name: "scheduled-reminder",
  description: "Create reminder events at scheduled times",
  version: "1.0.0",

  events: {
    async initialize(cfg: ScheduledReminderConfig, context: OAExtensionContext) {
      config = cfg;
      logger = context.logger;

      if (!config.reminders || config.reminders.length === 0) {
        logger.warn("No reminders configured");
      } else {
        logger.info(`Loaded ${config.reminders.length} reminder(s)`);
        for (const reminder of config.reminders) {
          logger.debug(
            `Reminder "${reminder.id}": ${reminder.time} on ${formatDays(reminder.days)}`,
          );
        }
      }
    },

    async poll() {
      const messages: string[] = [];

      for (const reminder of config.reminders ?? []) {
        if (shouldTrigger(reminder)) {
          markTriggered(reminder);

          const dayInfo =
            reminder.days !== undefined
              ? ` (scheduled for ${formatDays(reminder.days)})`
              : "";

          messages.push(
            `⏰ Reminder: ${reminder.message}\n\n` +
              `Time: ${reminder.time}${dayInfo}\n` +
              `ID: ${reminder.id}\n\n` +
              `Please acknowledge this reminder and take any necessary action.`,
          );

          logger.info(`Triggered reminder: ${reminder.id}`);
        }
      }

      return messages;
    },
  },

  piExtension(pi: ExtensionAPI) {
    // Tool to list all configured reminders
    pi.registerTool({
      name: "list_reminders",
      label: "List Reminders",
      description: "List all configured reminders and their next trigger times",
      parameters: Type.Object({}),
      async execute() {
        const currentTime = getCurrentTime();
        const currentDay = getCurrentDay();

        const reminderList = (config.reminders ?? []).map((r) => {
          const triggered = r.lastTriggered === getTodayDate();
          const matchesToday =
            r.days === undefined || r.days.includes(currentDay);
          const status = triggered
            ? "✓ Triggered today"
            : matchesToday
              ? "⏳ Pending today"
              : "○ Not scheduled today";

          return `- ${r.id}: "${r.message}" at ${r.time} on ${formatDays(r.days)} [${status}]`;
        });

        return {
          content: [
            {
              type: "text",
              text: `# Reminders (Current time: ${currentTime})\n\n${reminderList.join("\n") || "No reminders configured."}`,
            },
          ],
        };
      },
    });

    // Tool to add a new reminder (in-memory only, not persisted)
    pi.registerTool({
      name: "add_reminder",
      label: "Add Reminder",
      description:
        "Add a new reminder (note: only persists until restart unless added to config)",
      parameters: Type.Object({
        id: Type.String({ description: "Unique identifier for the reminder" }),
        message: Type.String({ description: "Reminder message" }),
        time: Type.String({
          description: "Time in HH:MM format (24-hour)",
          pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
        }),
        days: Type.Optional(
          Type.Array(Type.Number(), {
            description: "Days of week (0=Sunday, 1=Monday, etc.)",
          }),
        ),
      }),
      async execute(_id, params) {
        // Validate time format
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(params.time)) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid time format: ${params.time}. Use HH:MM format (e.g., "14:30").`,
              },
            ],
            isError: true,
          };
        }

        // Check for duplicate ID
        if (config.reminders?.some((r) => r.id === params.id)) {
          return {
            content: [
              {
                type: "text",
                text: `Reminder with ID "${params.id}" already exists.`,
              },
            ],
            isError: true,
          };
        }

        // Add the reminder
        const reminder: Reminder = {
          id: params.id,
          message: params.message,
          time: params.time,
          days: params.days,
        };

        if (!config.reminders) {
          config.reminders = [];
        }
        config.reminders.push(reminder);

        return {
          content: [
            {
              type: "text",
              text: `Added reminder "${params.id}": "${params.message}" at ${params.time} on ${formatDays(params.days)}\n\nNote: This reminder will be lost on restart. Add it to your config.json to persist it.`,
            },
          ],
        };
      },
    });
  },
} satisfies OtterAssistExtension;

/**
 * Configuration example (~/.otterassist/config.json):
 *
 * {
 *   "extensions": {
 *     "scheduled-reminder": {
 *       "enabled": true,
 *       "config": {
 *         "reminders": [
 *           {
 *             "id": "standup",
 *             "message": "Time for daily standup meeting!",
 *             "time": "09:30",
 *             "days": [1, 2, 3, 4, 5]
 *           },
 *           {
 *             "id": "lunch",
 *             "message": "Don't forget to take a lunch break!",
 *             "time": "12:00",
 *             "days": [1, 2, 3, 4, 5]
 *           },
 *           {
 *             "id": "eod",
 *             "message": "End of day - review your tasks and plan tomorrow",
 *             "time": "17:00",
 *             "days": [1, 2, 3, 4, 5]
 *           },
 *           {
 *             "id": "weekly-review",
 *             "message": "Time for weekly review!",
 *             "time": "16:00",
 *             "days": [5]
 *           }
 *         ]
 *       }
 *     }
 *   }
 * }
 *
 * Day codes:
 * 0 = Sunday
 * 1 = Monday
 * 2 = Tuesday
 * 3 = Wednesday
 * 4 = Thursday
 * 5 = Friday
 * 6 = Saturday
 *
 * Omit "days" for a reminder that triggers every day.
 */
