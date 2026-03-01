import { test, expect, describe, beforeEach } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import { api } from "../_generated/api.js";
import { Id } from "../_generated/dataModel.js";

const modules = {
  "../http.ts": () => import("../http.js"),
  "../events.ts": () => import("../events.js"),
  "../agents.ts": () => import("../agents.js"),
  "../messages.ts": () => import("../messages.js"),
  "../_generated/api.js": () => import("../_generated/api.js"),
  "../_generated/server.js": () => import("../_generated/server.js"),
};

describe("HTTP Webhook Endpoint", () => {
  let t: ReturnType<typeof convexTest>;
  let agentId: string;

  beforeEach(async () => {
    process.env.WEBHOOK_SECRET = "test-secret-key";
    t = convexTest(schema, modules);

    agentId = await t.mutation(api.agents.createAgent, {
      name: "Test Agent",
      systemPrompt: "Test prompt",
      llmProvider: "openai",
      llmModel: "gpt-4",
      tools: [],
      isActive: true,
    });
  });

  describe("POST /webhook/:agentId", () => {
    test("should return 401 when X-Webhook-Secret header is missing", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "github",
            content: "push event",
          }),
        }
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect((body as any).error).toBe("Unauthorized");
    });

    test("should return 401 when X-Webhook-Secret is invalid", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "wrong-secret",
          },
          body: JSON.stringify({
            source: "github",
            content: "push event",
          }),
        }
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect((body as any).error).toBe("Unauthorized");
    });

    test("should return 404 for non-existent agent", async () => {
      const fakeAgentId = "k57f8d9g2h3j4k5l6m7n8p9q";

      const response = await t.fetch(
        `/webhook/${fakeAgentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: "github",
            content: "push event",
          }),
        }
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect((body as any).error).toBe("Agent not found");
    });

    test("should return 400 for invalid JSON payload", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: "not valid json",
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect((body as any).error).toBe("Invalid JSON payload");
    });

    test("should return 400 when source is missing", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            content: "push event",
          }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect((body as any).error).toContain("source");
    });

    test("should return 400 when content is missing", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: "github",
          }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect((body as any).error).toContain("content");
    });

    test("should return 400 when source is not a string", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: 123,
            content: "push event",
          }),
        }
      );

      expect(response.status).toBe(400);
    });

    test("should successfully process webhook with valid data", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: "github",
            content: "Push to main branch",
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect((body as any).success).toBe(true);
      expect((body as any).messageId).toBeDefined();
      expect((body as any).eventId).toBeDefined();
    });

    test("should create message in webhook:source channel", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: "slack",
            content: "New message in #general",
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const messageId = (body as any).messageId;

      const message = await t.query(api.messages.getMessage, { messageId });
      expect(message?.channel).toBe("webhook:slack");
      expect(message?.content).toBe("New message in #general");
      expect(message?.role).toBe("user");
      expect(message?.read).toBe(false);
    });

    test("should create message with tags and metadata", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: "github",
            content: "PR opened",
            tags: ["pr", "important"],
            metadata: {
              prNumber: 42,
              author: "testuser",
            },
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const messageId = (body as any).messageId;

      const message = await t.query(api.messages.getMessage, { messageId });
      expect(message?.tags).toEqual(["pr", "important"]);
      expect(message?.metadata).toEqual({
        prNumber: 42,
        author: "testuser",
      });
    });

    test("should queue event linked to agent", async () => {
      const response = await t.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: "github",
            content: "Issue created",
          }),
        }
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const eventId = (body as any).eventId;

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.type).toBe("webhook.received");
      expect(event?.agentId).toBe(agentId as Id<"agents">);
      expect(event?.status).toBe("pending");
      expect(event?.payload?.source).toBe("github");
    });

    test("should handle different webhook sources", async () => {
      const sources = ["github", "gitlab", "slack", "discord", "custom"];

      for (const source of sources) {
        const response = await t.fetch(
          `/webhook/${agentId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Secret": "test-secret-key",
            },
            body: JSON.stringify({
              source,
              content: `Event from ${source}`,
            }),
          }
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        const messageId = (body as any).messageId;

        const message = await t.query(api.messages.getMessage, { messageId });
        expect(message?.channel).toBe(`webhook:${source}`);
      }
    });

    test("should return 400 when agentId is missing from path", async () => {
      const response = await t.fetch(
        "/webhook/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": "test-secret-key",
          },
          body: JSON.stringify({
            source: "github",
            content: "push event",
          }),
        }
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect((body as any).error).toContain("agentId");
    });
  });

  describe("Server configuration", () => {
    test("should return 500 when WEBHOOK_SECRET is not configured", async () => {
      delete process.env.WEBHOOK_SECRET;
      const t2 = convexTest(schema, modules);

      const response = await t2.fetch(
        `/webhook/${agentId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: "github",
            content: "push event",
          }),
        }
      );

      expect(response.status).toBe(500);
      const body = await response.json();
      expect((body as any).error).toBe("Server configuration error");
    });
  });
});
