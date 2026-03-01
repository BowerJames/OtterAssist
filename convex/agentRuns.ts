import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

export const createRun = mutation({
  args: {
    agentId: v.id("agents"),
    triggerType: v.union(v.literal("manual"), v.literal("scheduled"), v.literal("event")),
    triggerData: v.optional(v.record(v.string(), v.any())),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentRuns", {
      agentId: args.agentId,
      triggerType: args.triggerType,
      triggerData: args.triggerData,
      instructions: args.instructions,
      status: "pending",
      startedAt: Date.now(),
    });
  },
});

export const updateRunStatus = mutation({
  args: {
    runId: v.id("agentRuns"),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, { status: args.status });
  },
});

export const setRunError = mutation({
  args: {
    runId: v.id("agentRuns"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      completedAt: Date.now(),
    });
  },
});

export const setRunCompleted = mutation({
  args: {
    runId: v.id("agentRuns"),
    trajectoryPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "completed",
      trajectoryPath: args.trajectoryPath,
      completedAt: Date.now(),
    });
  },
});

export const listRuns = query({
  args: {
    agentId: v.id("agents"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getRun = query({
  args: {
    runId: v.id("agentRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

export const getActiveRun = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .first();
  },
});
