/**
 * Hello World Extension
 *
 * The simplest possible extension that demonstrates the basic structure.
 * Produces a greeting event on every poll.
 *
 * This is a learning example - not practical for real use!
 */

import type { OtterAssistExtension, OAExtensionContext } from "otterassist";

interface HelloConfig {
  /** Name to greet (default: "World") */
  name?: string;
}

let config: HelloConfig;

export default {
  name: "hello",
  description: "Simple example that produces greeting events",
  version: "1.0.0",

  events: {
    async initialize(cfg: HelloConfig, context: OAExtensionContext) {
      config = cfg;
      context.logger.info(`Hello extension initialized`);
      context.logger.debug(`Name: ${cfg.name ?? "World"}`);
    },

    async poll() {
      // This is called on every scheduler tick
      // In a real extension, you'd check for new items and only
      // return events when there's something new

      const name = config.name ?? "World";
      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

      // Return event messages for the queue
      // Each message becomes a user message to the agent
      return [
        `Good ${timeOfDay}, ${name}! This is a test event from the hello extension.

This extension demonstrates the basic structure of an OtterAssist extension.

You can mark this event as complete to acknowledge it.`,
      ];
    },
  },
} satisfies OtterAssistExtension;

/**
 * Configuration example (~/.otterassist/config.json):
 *
 * {
 *   "extensions": {
 *     "hello": {
 *       "enabled": true,
 *       "config": {
 *         "name": "OtterAssist User"
 *       }
 *     }
 *   }
 * }
 *
 * Note: This extension produces an event on EVERY poll, which is not
 * typical behavior. Real extensions should only produce events when
 * there's actually something new to process.
 */
