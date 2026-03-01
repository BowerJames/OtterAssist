import { test, expect, describe, beforeEach } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import { api, internal } from "../_generated/api.js";

const modules = {
  "../events.ts": () => import("../events.js"),
  "../agents.ts": () => import("../agents.js"),
  "../_generated/api.js": () => import("../_generated/api.js"),
  "../_generated/server.js": () => import("../_generated/server.js"),
};

describe("Events Module", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
  });

  describe("queueEvent", () => {
    test("should create an event with required fields", async () => {
      const eventId = await t.mutation(api.events.queueEvent, {
        type: "test.event",
      });

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe("string");
    });

    test("should create an event with payload", async () => {
      const payload = { key: "value", nested: { data: 123 } };
      const eventId = await t.mutation(api.events.queueEvent, {
        type: "test.event",
        payload,
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.payload).toEqual(payload);
    });

    test("should create an event linked to an agent", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "Test Agent",
        systemPrompt: "Test prompt",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      const eventId = await t.mutation(api.events.queueEvent, {
        type: "agent.trigger",
        agentId,
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.agentId).toBe(agentId);
    });

    test("should set status to pending", async () => {
      const eventId = await t.mutation(api.events.queueEvent, {
        type: "test.event",
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.status).toBe("pending");
    });

    test("should set createdAt timestamp", async () => {
      const before = Date.now();
      const eventId = await t.mutation(api.events.queueEvent, {
        type: "test.event",
      });
      const after = Date.now();

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.createdAt).toBeGreaterThanOrEqual(before);
      expect(event?.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe("markEventProcessed", () => {
    test("should update event status to processed", async () => {
      const eventId = await t.mutation(api.events.queueEvent, {
        type: "test.event",
      });

      await t.mutation(api.events.markEventProcessed, { eventId });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.status).toBe("processed");
    });
  });

  describe("markEventFailed", () => {
    test("should update event status to failed", async () => {
      const eventId = await t.mutation(api.events.queueEvent, {
        type: "test.event",
      });

      await t.mutation(api.events.markEventFailed, { eventId });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.status).toBe("failed");
    });
  });

  describe("listPendingEvents", () => {
    test("should return empty array when no pending events", async () => {
      const events = await t.query(api.events.listPendingEvents, {});
      expect(events).toEqual([]);
    });

    test("should return only pending events", async () => {
      const event1 = await t.mutation(api.events.queueEvent, {
        type: "event.1",
      });
      const event2 = await t.mutation(api.events.queueEvent, {
        type: "event.2",
      });
      await t.mutation(api.events.queueEvent, {
        type: "event.3",
      });

      await t.mutation(api.events.markEventProcessed, { eventId: event1 });
      await t.mutation(api.events.markEventFailed, { eventId: event2 });

      const events = await t.query(api.events.listPendingEvents, {});
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("event.3");
    });

    test("should return events ordered by createdAt ascending", async () => {
      await t.mutation(api.events.queueEvent, { type: "event.1" });
      await t.mutation(api.events.queueEvent, { type: "event.2" });
      await t.mutation(api.events.queueEvent, { type: "event.3" });

      const events = await t.query(api.events.listPendingEvents, {});

      expect(events.length).toBe(3);
      expect(events[0].type).toBe("event.1");
      expect(events[1].type).toBe("event.2");
      expect(events[2].type).toBe("event.3");
      expect(events[0].createdAt).toBeLessThanOrEqual(events[1].createdAt);
      expect(events[1].createdAt).toBeLessThanOrEqual(events[2].createdAt);
    });
  });

  describe("getNextEvent", () => {
    test("should return null when no pending events", async () => {
      const event = await t.query(api.events.getNextEvent, {});
      expect(event).toBeNull();
    });

    test("should return the oldest pending event", async () => {
      await t.mutation(api.events.queueEvent, { type: "event.1" });
      await t.mutation(api.events.queueEvent, { type: "event.2" });
      await t.mutation(api.events.queueEvent, { type: "event.3" });

      const event = await t.query(api.events.getNextEvent, {});
      expect(event?.type).toBe("event.1");
    });

    test("should only return pending events", async () => {
      const event1 = await t.mutation(api.events.queueEvent, {
        type: "event.1",
      });
      await t.mutation(api.events.queueEvent, { type: "event.2" });

      await t.mutation(api.events.markEventProcessed, { eventId: event1 });

      const event = await t.query(api.events.getNextEvent, {});
      expect(event?.type).toBe("event.2");
    });
  });

  describe("getEvent", () => {
    test("should retrieve an existing event", async () => {
      const eventId = await t.mutation(api.events.queueEvent, {
        type: "test.event",
        payload: { key: "value" },
      });

      const event = await t.query(api.events.getEvent, { eventId });

      expect(event).toBeDefined();
      expect(event?.type).toBe("test.event");
      expect(event?.payload).toEqual({ key: "value" });
      expect(event?.status).toBe("pending");
    });

    test("should return null for non-existent event", async () => {
      const eventId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("events", {
          type: "temporary",
          status: "pending",
          createdAt: Date.now(),
        });
        await ctx.db.delete(id);
        return id;
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event).toBeNull();
    });
  });

  describe("createEventFromWebhook", () => {
    test("should create an event from webhook payload", async () => {
      const eventId = await t.run(async (ctx) => {
        return await ctx.runMutation(internal.events.createEventFromWebhook, {
          type: "webhook.github",
          payload: { repo: "test/repo", action: "push" },
        });
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.type).toBe("webhook.github");
      expect(event?.payload).toEqual({ repo: "test/repo", action: "push" });
      expect(event?.status).toBe("pending");
    });

    test("should create webhook event linked to agent", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "Webhook Agent",
        systemPrompt: "Handle webhooks",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      const eventId = await t.run(async (ctx) => {
        return await ctx.runMutation(internal.events.createEventFromWebhook, {
          type: "webhook.github",
          agentId,
        });
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.agentId).toBe(agentId);
    });
  });

  describe("createEventFromSchedule", () => {
    test("should create an event from schedule trigger", async () => {
      const eventId = await t.run(async (ctx) => {
        return await ctx.runMutation(internal.events.createEventFromSchedule, {
          type: "scheduled.check",
          payload: { interval: "hourly" },
        });
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.type).toBe("scheduled.check");
      expect(event?.payload).toEqual({ interval: "hourly" });
      expect(event?.status).toBe("pending");
    });

    test("should create scheduled event linked to agent", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "Scheduled Agent",
        systemPrompt: "Run scheduled tasks",
        llmProvider: "anthropic",
        llmModel: "claude-3",
        tools: [],
        isActive: true,
      });

      const eventId = await t.run(async (ctx) => {
        return await ctx.runMutation(internal.events.createEventFromSchedule, {
          type: "scheduled.task",
          agentId,
        });
      });

      const event = await t.query(api.events.getEvent, { eventId });
      expect(event?.agentId).toBe(agentId);
    });
  });
});
