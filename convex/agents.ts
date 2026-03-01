import { mutation, query, internalQuery, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const createAgent = mutation({
  args: {
    name: v.string(),
    systemPrompt: v.string(),
    llmProvider: v.string(),
    llmModel: v.string(),
    tools: v.array(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agents", args);
  },
});

export const updateAgent = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    llmProvider: v.optional(v.string()),
    llmModel: v.optional(v.string()),
    tools: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { agentId, ...fields } = args;
    const updateData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }
    
    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(agentId, updateData);
    }
  },
});

export const deleteAgent = mutation({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.agentId);
  },
});

export const listAgents = query({
  args: {
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db.query("agents").collect();
    
    if (args.isActive !== undefined) {
      return agents.filter((agent) => agent.isActive === args.isActive);
    }
    
    return agents;
  },
});

export const getAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agentId);
  },
});

export const getAgentInternal = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agentId);
  },
});

export const getAgentInternalQuery = internalQuery({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.agentId);
  },
});

export const getAgentByName = internalQuery({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
  },
});

export const listAgentsWithFileTriggers = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("agents").collect();
    return agents.filter(
      (agent) => agent.isActive && agent.fileTriggers && agent.fileTriggers.length > 0
    );
  },
});
