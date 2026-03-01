import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

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
