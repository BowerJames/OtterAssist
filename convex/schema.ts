import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    name: v.string(),
    systemPrompt: v.string(),
    llmProvider: v.string(),
    llmModel: v.string(),
    tools: v.array(v.string()),
    isActive: v.boolean(),
  }),

  messages: defineTable({
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    channel: v.string(),
    read: v.boolean(),
    tags: v.array(v.string()),
    metadata: v.optional(v.record(v.string(), v.any())),
  })
    .index("by_channel", ["channel"])
    .index("by_read", ["read"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["channel", "role"],
    }),

  agentRuns: defineTable({
    agentId: v.id("agents"),
    triggerType: v.union(v.literal("manual"), v.literal("scheduled"), v.literal("event")),
    triggerData: v.optional(v.record(v.string(), v.any())),
    instructions: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
    trajectoryPath: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"]),

  events: defineTable({
    type: v.string(),
    payload: v.optional(v.record(v.string(), v.any())),
    agentId: v.optional(v.id("agents")),
    status: v.union(v.literal("pending"), v.literal("processed"), v.literal("failed")),
    createdAt: v.number(),
  })
    .index("by_status", ["status"]),
});
