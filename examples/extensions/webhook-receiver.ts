/**
 * Webhook Receiver Extension
 *
 * Receives webhook events via a local HTTP server.
 * Demonstrates HTTP integration and real-time event generation.
 *
 * Features:
 * - Local HTTP server for receiving webhooks
 * - Configurable port and path
 * - Validates webhook payloads
 * - Provides events to the queue when webhooks are received
 *
 * Note: This extension requires additional setup:
 * 1. Install express: bun add express (in extensions directory)
 * 2. Configure external services to send webhooks to http://localhost:PORT/webhook
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { OtterAssistExtension, OAExtensionContext } from "otterassist";

interface WebhookReceiverConfig {
  /** Port to listen on (default: 3456) */
  port?: number;
  /** Path for webhook endpoint (default: /webhook) */
  path?: string;
  /** Secret for validating webhooks (optional) */
  secret?: string;
}

interface PendingWebhook {
  id: string;
  source: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  receivedAt: Date;
}

let server: ReturnType<typeof import("express")().listen> | null = null;
let pendingWebhooks: PendingWebhook[] = [];
let config: Required<WebhookReceiverConfig>;
let logger: OAExtensionContext["logger"];

export default {
  name: "webhook-receiver",
  description: "Receive webhooks via local HTTP server",
  version: "1.0.0",

  events: {
    async initialize(cfg: WebhookReceiverConfig, context: OAExtensionContext) {
      config = {
        port: cfg.port ?? 3456,
        path: cfg.path ?? "/webhook",
        secret: cfg.secret,
      };

      logger = context.logger;

      // Try to import express
      let express: typeof import("express").default;
      try {
        express = (await import("express")).default;
      } catch {
        logger.warn(
          "Express not installed. Run 'bun add express' in the extensions directory.",
        );
        logger.warn("Webhook receiver will not start.");
        return;
      }

      const app = express();
      app.use(express.json());

      // Webhook endpoint
      app.post(config.path, (req, res) => {
        // Validate secret if configured
        if (config.secret) {
          const providedSecret = req.headers["x-webhook-secret"];
          if (providedSecret !== config.secret) {
            logger.warn("Webhook rejected: invalid secret");
            res.status(401).json({ error: "Invalid secret" });
            return;
          }
        }

        const webhook: PendingWebhook = {
          id: crypto.randomUUID(),
          source: (req.headers["x-webhook-source"] as string) ?? "unknown",
          payload: req.body,
          headers: req.headers as Record<string, string>,
          receivedAt: new Date(),
        };

        pendingWebhooks.push(webhook);
        logger.info(`Webhook received from ${webhook.source}`);

        res.status(200).json({ received: true, id: webhook.id });
      });

      // Health check endpoint
      app.get("/health", (_req, res) => {
        res.json({ status: "ok", pending: pendingWebhooks.length });
      });

      // Start server
      server = app.listen(config.port, () => {
        logger.info(`Webhook server listening on port ${config.port}`);
        logger.info(`Webhook endpoint: http://localhost:${config.port}${config.path}`);
      });

      server.on("error", (error) => {
        logger.error(`Webhook server error: ${error.message}`);
      });
    },

    async poll() {
      const webhooks = [...pendingWebhooks];
      pendingWebhooks = [];

      return webhooks.map((webhook) => {
        const payloadStr = JSON.stringify(webhook.payload, null, 2);
        return `🔔 Webhook received from ${webhook.source}

Webhook ID: ${webhook.id}
Received: ${webhook.receivedAt.toLocaleString()}

Payload:
\`\`\`json
${payloadStr.slice(0, 2000)}${payloadStr.length > 2000 ? "\n... (truncated)" : ""}
\`\`\`

Please process this webhook appropriately. Use the webhook-receiver skill for guidance.`;
      });
    },

    async shutdown() {
      if (server) {
        server.close();
        logger?.info("Webhook server stopped");
      }
    },
  },

  piExtension(pi: ExtensionAPI) {
    // Register skill for webhook handling
    pi.registerSkill?.({
      name: "webhook-receiver",
      description: "Guidance for processing received webhooks",
      content: `# Webhook Processing Guide

This skill guides you through processing webhooks received by the webhook-receiver extension.

## Webhook Format

All webhooks contain:
- \`id\`: Unique identifier for this webhook
- \`source\`: Origin of the webhook (from X-Webhook-Source header)
- \`payload\`: JSON body of the webhook
- \`headers\`: HTTP headers sent with the webhook
- \`receivedAt\`: Timestamp when received

## Common Webhook Sources

### GitHub
- Source: \`github\`
- Events: push, pull_request, issues, etc.
- Validate using X-Hub-Signature-256 header

### Stripe
- Source: \`stripe\`
- Events: payment_intent.succeeded, invoice.paid, etc.
- Validate using Stripe-Signature header

### Slack
- Source: \`slack\`
- Events: url_verification, event_callback
- Respond to challenges immediately

### Custom
- Source: custom or your own identifier
- Process according to your integration

## Processing Guidelines

1. **Identify the source** - Check the source field to understand the webhook type
2. **Validate if needed** - For critical webhooks, verify signatures
3. **Parse the payload** - Extract relevant information
4. **Take action** - Based on the webhook type:
   - Notifications: Send alerts, create tickets
   - Data sync: Update local files or databases
   - Triggers: Execute commands or scripts
5. **Acknowledge** - Some webhooks need a response

## Security

- Never expose secrets in logs
- Validate signatures for production webhooks
- Be cautious with executable content
- Rate-limit processing if needed`,
    });

    // Tool to get webhook stats
    pi.registerTool({
      name: "webhook_stats",
      label: "Webhook Stats",
      description: "Get statistics about received webhooks",
      parameters: Type.Object({}),
      async execute() {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  server: server ? "running" : "stopped",
                  port: config.port,
                  path: config.path,
                  pendingCount: pendingWebhooks.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    });

    // Tool to clear pending webhooks
    pi.registerTool({
      name: "clear_webhooks",
      label: "Clear Pending Webhooks",
      description: "Clear all pending webhooks without processing",
      parameters: Type.Object({}),
      async execute() {
        const count = pendingWebhooks.length;
        pendingWebhooks = [];
        return {
          content: [
            {
              type: "text",
              text: `Cleared ${count} pending webhook(s)`,
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
 *     "webhook-receiver": {
 *       "enabled": true,
 *       "config": {
 *         "port": 3456,
 *         "path": "/webhook",
 *         "secret": "$WEBHOOK_SECRET"
 *       }
 *     }
 *   }
 * }
 *
 * Setup:
 * 1. Install express:
 *    cd ~/.otterassist/extensions
 *    bun add express
 *
 * 2. Configure external services to send webhooks:
 *    http://localhost:3456/webhook
 *
 * 3. (Optional) Set the secret for validation:
 *    export WEBHOOK_SECRET=your-secret-here
 *
 * 4. Include X-Webhook-Source header to identify the source:
 *    curl -X POST http://localhost:3456/webhook \
 *      -H "Content-Type: application/json" \
 *      -H "X-Webhook-Source: myapp" \
 *      -d '{"event": "test", "data": "hello"}'
 *
 * For external access, use a tunnel like ngrok:
 *   ngrok http 3456
 * Then configure webhooks to point to the ngrok URL.
 */
