import { mutation, query, internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const queueEvent = mutation({
  args: {
    type: v.string(),
    payload: v.optional(v.record(v.string(), v.any())),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      type: args.type,
      payload: args.payload,
      agentId: args.agentId,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const markEventProcessed = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { status: "processed" });
  },
});

export const markEventFailed = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { status: "failed" });
  },
});

export const markEventProcessing = internalMutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { status: "processing" });
  },
});

export const claimNextEvent = mutation({
  args: {},
  handler: async (ctx) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .first();

    if (!event) {
      return null;
    }

    await ctx.db.patch(event._id, { status: "processing" });
    return event;
  },
});

export const listPendingEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .collect();
  },
});

export const getNextEvent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .first();
  },
});

export const getEvent = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
  },
});

export const createEventFromWebhook = internalMutation({
  args: {
    type: v.string(),
    payload: v.optional(v.record(v.string(), v.any())),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      type: args.type,
      payload: args.payload,
      agentId: args.agentId,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const createEventFromSchedule = internalMutation({
  args: {
    type: v.string(),
    payload: v.optional(v.record(v.string(), v.any())),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("events", {
      type: args.type,
      payload: args.payload,
      agentId: args.agentId,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const triggerScheduledRun = internalAction({
  args: {
    agentName: v.string(),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.runQuery(internal.agents.getAgentByName, {
      name: args.agentName,
    });

    if (!agent) {
      throw new Error(`Agent not found: ${args.agentName}`);
    }

    const eventId = await ctx.runMutation(internal.events.createEventFromSchedule, {
      type: "scheduled",
      agentId: agent._id,
    });

    await ctx.runMutation(internal.agentRuns.createRunInternalForConvex, {
      agentId: agent._id,
      triggerType: "scheduled",
      triggerData: { eventId },
      instructions: args.instructions,
    });
  },
});
