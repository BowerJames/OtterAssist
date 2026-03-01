import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

function parseRelativeTime(input: string): number | null {
  const match = input.match(/^(\d+)(m|h|d|w)$/);
  if (!match) return null;

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const now = Date.now();

  switch (unit) {
    case "m":
      return now - value * 60 * 1000;
    case "h":
      return now - value * 60 * 60 * 1000;
    case "d":
      return now - value * 24 * 60 * 60 * 1000;
    case "w":
      return now - value * 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

export const ingestMessage = mutation({
  args: {
    content: v.string(),
    channel: v.string(),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      content: args.content,
      role: "user",
      channel: args.channel,
      read: false,
      tags: args.tags ?? [],
      metadata: args.metadata,
    });
  },
});

export const ingestMessageInternal = internalMutation({
  args: {
    content: v.string(),
    channel: v.string(),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      content: args.content,
      role: "user",
      channel: args.channel,
      read: false,
      tags: args.tags ?? [],
      metadata: args.metadata,
    });
  },
});

export const writeMessage = mutation({
  args: {
    content: v.string(),
    channel: v.string(),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      content: args.content,
      role: "assistant",
      channel: args.channel,
      read: true,
      tags: args.tags ?? [],
      metadata: args.metadata,
    });
  },
});

export const markRead = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { read: true });
  },
});

export const listMessages = query({
  args: {
    channel: v.optional(v.string()),
    read: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (args.channel) {
      const result = await ctx.db
        .query("messages")
        .withIndex("by_channel", (q) => q.eq("channel", args.channel!))
        .order("desc")
        .paginate(args.paginationOpts);

      let filtered = result.page;
      if (args.read !== undefined) {
        filtered = filtered.filter((msg) => msg.read === args.read);
      }
      if (args.tags && args.tags.length > 0) {
        filtered = filtered.filter((msg) => args.tags!.some((tag) => msg.tags.includes(tag)));
      }

      return { ...result, page: filtered };
    }

    if (args.read !== undefined) {
      const result = await ctx.db
        .query("messages")
        .withIndex("by_read", (q) => q.eq("read", args.read!))
        .order("desc")
        .paginate(args.paginationOpts);

      let filtered = result.page;
      if (args.tags && args.tags.length > 0) {
        filtered = filtered.filter((msg) => args.tags!.some((tag) => msg.tags.includes(tag)));
      }

      return { ...result, page: filtered };
    }

    const result = await ctx.db
      .query("messages")
      .order("desc")
      .paginate(args.paginationOpts);

    let filtered = result.page;
    if (args.tags && args.tags.length > 0) {
      filtered = filtered.filter((msg) => args.tags!.some((tag) => msg.tags.includes(tag)));
    }

    return { ...result, page: filtered };
  },
});

export const getMessage = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

export const search = query({
  args: {
    pattern: v.optional(v.string()),
    patternFlags: v.optional(v.string()),
    before: v.optional(v.id("messages")),
    after: v.optional(v.id("messages")),
    around: v.optional(v.id("messages")),
    contextSize: v.optional(v.number()),
    since: v.optional(v.union(v.number(), v.string())),
    until: v.optional(v.union(v.number(), v.string())),
    last: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagsAll: v.optional(v.array(v.string())),
    read: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal("user"), v.literal("assistant"), v.literal("system"))),
    channel: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    if (args.around) {
      return await searchWithContext(ctx, args);
    }

    if (args.before || args.after) {
      return await searchWithContextDirection(ctx, args);
    }

    let sinceTime: number | undefined;
    let untilTime: number | undefined;

    if (args.since !== undefined) {
      sinceTime = typeof args.since === "string" ? parseRelativeTime(args.since) ?? (args.since as unknown as number) : args.since;
    }
    if (args.until !== undefined) {
      untilTime = typeof args.until === "string" ? parseRelativeTime(args.until) ?? (args.until as unknown as number) : args.until;
    }
    if (args.last !== undefined) {
      sinceTime = parseRelativeTime(args.last) ?? undefined;
    }

    const limit = args.limit ?? 100;

    let messages;
    if (args.channel) {
      messages = await ctx.db
        .query("messages")
        .withIndex("by_channel", (q) => q.eq("channel", args.channel!))
        .order("desc")
        .take(limit * 3);
    } else if (args.read !== undefined) {
      messages = await ctx.db
        .query("messages")
        .withIndex("by_read", (q) => q.eq("read", args.read!))
        .order("desc")
        .take(limit * 3);
    } else {
      messages = await ctx.db
        .query("messages")
        .order("desc")
        .take(limit * 3);
    }

    if (sinceTime !== undefined) {
      messages = messages.filter((msg) => msg._creationTime >= sinceTime!);
    }
    if (untilTime !== undefined) {
      messages = messages.filter((msg) => msg._creationTime <= untilTime!);
    }

    if (args.role !== undefined) {
      messages = messages.filter((msg) => msg.role === args.role);
    }
    if (args.read !== undefined && args.channel) {
      messages = messages.filter((msg) => msg.read === args.read);
    }

    if (args.tags && args.tags.length > 0) {
      messages = messages.filter((msg) => args.tags!.some((tag) => msg.tags.includes(tag)));
    }
    if (args.tagsAll && args.tagsAll.length > 0) {
      messages = messages.filter((msg) => args.tagsAll!.every((tag) => msg.tags.includes(tag)));
    }

    if (args.pattern) {
      try {
        const regex = new RegExp(args.pattern, args.patternFlags ?? "");
        messages = messages.filter((msg) => regex.test(msg.content));
      } catch {
        messages = messages.filter((msg) => msg.content.includes(args.pattern!));
      }
    }

    let cursorIndex = 0;
    if (args.cursor) {
      cursorIndex = messages.findIndex((msg) => msg._id === args.cursor);
      if (cursorIndex >= 0) {
        cursorIndex++;
      } else {
        cursorIndex = 0;
      }
    }

    const paginatedMessages = messages.slice(cursorIndex, cursorIndex + limit);
    const hasMore = cursorIndex + limit < messages.length;
    const nextCursor = hasMore && paginatedMessages.length > 0
      ? paginatedMessages[paginatedMessages.length - 1]!._id
      : null;

    return {
      messages: paginatedMessages,
      cursor: nextCursor,
      hasMore,
    };
  },
});

async function searchWithContext(
  ctx: { db: any },
  args: { around?: string; contextSize?: number }
): Promise<{ messages: any[]; cursor: string | null; hasMore: boolean }> {
  if (!args.around) {
    return { messages: [], cursor: null, hasMore: false };
  }
  const targetMessage = await ctx.db.get(args.around);
  if (!targetMessage) {
    return { messages: [], cursor: null, hasMore: false };
  }

  const contextSize = args.contextSize ?? 10;
  const beforeCount = Math.floor(contextSize / 2);
  const afterCount = Math.ceil(contextSize / 2);

  const beforeMessages = await ctx.db
    .query("messages")
    .withIndex("by_channel", (q: any) => q.eq("channel", targetMessage.channel))
    .order("desc")
    .filter((q: any) => q.gt(q.field("_creationTime"), targetMessage._creationTime))
    .take(beforeCount);

  const afterMessages = await ctx.db
    .query("messages")
    .withIndex("by_channel", (q: any) => q.eq("channel", targetMessage.channel))
    .order("asc")
    .filter((q: any) => q.lt(q.field("_creationTime"), targetMessage._creationTime))
    .take(afterCount);

  const messages = [
    ...[...afterMessages].reverse(),
    targetMessage,
    ...beforeMessages,
  ].sort((a: any, b: any) => b._creationTime - a._creationTime);

  return {
    messages,
    cursor: null,
    hasMore: false,
  };
}

async function searchWithContextDirection(
  ctx: { db: any },
  args: { before?: any; after?: any; contextSize?: number; limit?: number }
): Promise<{ messages: any[]; cursor: string | null; hasMore: boolean }> {
  const limit = args.limit ?? 100;

  if (args.before) {
    const targetMessage = await ctx.db.get(args.before);
    if (!targetMessage) {
      return { messages: [], cursor: null, hasMore: false };
    }

    const contextSize = args.contextSize ?? limit;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q: any) => q.eq("channel", targetMessage.channel))
      .order("desc")
      .filter((q: any) => q.gt(q.field("_creationTime"), targetMessage._creationTime))
      .take(contextSize);

    return {
      messages: [...messages].sort((a: any, b: any) => b._creationTime - a._creationTime),
      cursor: null,
      hasMore: false,
    };
  }

  if (args.after) {
    const targetMessage = await ctx.db.get(args.after);
    if (!targetMessage) {
      return { messages: [], cursor: null, hasMore: false };
    }

    const contextSize = args.contextSize ?? limit;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q: any) => q.eq("channel", targetMessage.channel))
      .order("asc")
      .filter((q: any) => q.lt(q.field("_creationTime"), targetMessage._creationTime))
      .take(contextSize);

    return {
      messages: [...messages].sort((a: any, b: any) => b._creationTime - a._creationTime),
      cursor: null,
      hasMore: false,
    };
  }

  return { messages: [], cursor: null, hasMore: false };
}

export const listUnread = query({
  args: {
    channel: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_read", (q) => q.eq("read", false))
      .order("desc")
      .take(limit);

    if (args.channel) {
      return messages.filter((msg) => msg.channel === args.channel);
    }

    return messages;
  },
});
