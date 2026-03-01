import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

http.route({
  pathPrefix: "/webhook/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("WEBHOOK_SECRET environment variable not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const providedSecret = request.headers.get("X-Webhook-Secret");

    if (!providedSecret || providedSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const webhookIndex = pathParts.indexOf("webhook");
    const agentId = webhookIndex >= 0 && pathParts[webhookIndex + 1]
      ? pathParts[webhookIndex + 1]
      : null;

    if (!agentId) {
      return new Response(
        JSON.stringify({ error: "Missing agentId in path" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("source" in body) ||
      !("content" in body) ||
      typeof (body as any).source !== "string" ||
      typeof (body as any).content !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: source and content must be strings" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { source, content, metadata, tags } = body as {
      source: string;
      content: string;
      metadata?: Record<string, any>;
      tags?: string[];
    };

    try {
      const agent = await ctx.runQuery(internal.agents.getAgentInternal, {
        agentId: agentId as Id<"agents">,
      });

      if (!agent) {
        return new Response(
          JSON.stringify({ error: "Agent not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const channel = `webhook:${source}`;

      const messageId = await ctx.runMutation(internal.messages.ingestMessageInternal, {
        content,
        channel,
        tags: tags ?? [],
        metadata,
      });

      const eventId = await ctx.runMutation(internal.events.createEventFromWebhook, {
        type: "webhook.received",
        payload: {
          source,
          messageId,
          metadata,
        },
        agentId: agentId as Id<"agents">,
      });

      return new Response(
        JSON.stringify({
          success: true,
          messageId,
          eventId,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Expected ID for table")) {
        return new Response(
          JSON.stringify({ error: "Agent not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      console.error("Webhook processing error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

export default http;
