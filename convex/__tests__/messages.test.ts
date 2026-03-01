import { test, expect, describe, beforeEach } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import { api, internal } from "../_generated/api.js";

const modules = {
  "../messages.ts": () => import("../messages.js"),
  "../_generated/api.js": () => import("../_generated/api.js"),
  "../_generated/server.js": () => import("../_generated/server.js"),
};

describe("Messages Module", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
  });

  describe("ingestMessage", () => {
    test("should create a user message with read=false", async () => {
      const messageId = await t.mutation(api.messages.ingestMessage, {
        content: "Hello, world!",
        channel: "general",
      });

      expect(messageId).toBeDefined();
      expect(typeof messageId).toBe("string");

      const message = await t.query(api.messages.getMessage, { messageId });
      expect(message).toBeDefined();
      expect(message?.content).toBe("Hello, world!");
      expect(message?.role).toBe("user");
      expect(message?.channel).toBe("general");
      expect(message?.read).toBe(false);
      expect(message?.tags).toEqual([]);
    });

    test("should create message with tags and metadata", async () => {
      const messageId = await t.mutation(api.messages.ingestMessage, {
        content: "Important message",
        channel: "alerts",
        tags: ["urgent", "system"],
        metadata: { priority: 1, source: "monitoring" },
      });

      const message = await t.query(api.messages.getMessage, { messageId });
      expect(message?.tags).toEqual(["urgent", "system"]);
      expect(message?.metadata).toEqual({ priority: 1, source: "monitoring" });
    });
  });

  describe("writeMessage", () => {
    test("should create an assistant message with read=true", async () => {
      const messageId = await t.mutation(api.messages.writeMessage, {
        content: "AI response",
        channel: "general",
      });

      expect(messageId).toBeDefined();

      const message = await t.query(api.messages.getMessage, { messageId });
      expect(message?.role).toBe("assistant");
      expect(message?.read).toBe(true);
    });
  });

  describe("markRead", () => {
    test("should mark a message as read", async () => {
      const messageId = await t.mutation(api.messages.ingestMessage, {
        content: "Unread message",
        channel: "general",
      });

      let message = await t.query(api.messages.getMessage, { messageId });
      expect(message?.read).toBe(false);

      await t.mutation(api.messages.markRead, { messageId });

      message = await t.query(api.messages.getMessage, { messageId });
      expect(message?.read).toBe(true);
    });
  });

  describe("getMessage", () => {
    test("should return null for non-existent message", async () => {
      const deletedId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("messages", {
          content: "temp",
          role: "user",
          channel: "temp",
          read: false,
          tags: [],
        });
        await ctx.db.delete(id);
        return id;
      });

      const message = await t.query(api.messages.getMessage, { messageId: deletedId });
      expect(message).toBeNull();
    });
  });

  describe("listMessages", () => {
    beforeEach(async () => {
      await t.mutation(api.messages.ingestMessage, {
        content: "Message 1",
        channel: "general",
        tags: ["tag1"],
      });
      await t.mutation(api.messages.writeMessage, {
        content: "Message 2",
        channel: "general",
        tags: ["tag2"],
      });
      await t.mutation(api.messages.ingestMessage, {
        content: "Message 3",
        channel: "random",
        tags: ["tag1", "tag2"],
      });
    });

    test("should list all messages with pagination", async () => {
      const result = await t.query(api.messages.listMessages, {
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.length).toBe(3);
      expect(result.isDone).toBe(true);
    });

    test("should filter by channel", async () => {
      const result = await t.query(api.messages.listMessages, {
        channel: "general",
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.length).toBe(2);
      expect(result.page.every((m: { channel: string }) => m.channel === "general")).toBe(true);
    });

    test("should filter by read status", async () => {
      const result = await t.query(api.messages.listMessages, {
        read: true,
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.length).toBe(1);
      expect(result.page[0].content).toBe("Message 2");
    });

    test("should filter by tags (any match)", async () => {
      const result = await t.query(api.messages.listMessages, {
        tags: ["tag1"],
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.length).toBe(2);
    });

    test("should paginate results", async () => {
      const page1 = await t.query(api.messages.listMessages, {
        paginationOpts: { numItems: 2, cursor: null },
      });

      expect(page1.page.length).toBe(2);
      expect(page1.isDone).toBe(false);

      const page2 = await t.query(api.messages.listMessages, {
        paginationOpts: { numItems: 2, cursor: page1.continueCursor },
      });

      expect(page2.page.length).toBe(1);
      expect(page2.isDone).toBe(true);
    });
  });

  describe("listUnread", () => {
    beforeEach(async () => {
      await t.mutation(api.messages.ingestMessage, {
        content: "Unread 1",
        channel: "general",
      });
      await t.mutation(api.messages.ingestMessage, {
        content: "Unread 2",
        channel: "random",
      });
      await t.mutation(api.messages.writeMessage, {
        content: "Read (assistant)",
        channel: "general",
      });
    });

    test("should return only unread messages", async () => {
      const messages = await t.query(api.messages.listUnread, {});

      expect(messages.length).toBe(2);
      expect(messages.every((m: any) => m.read === false)).toBe(true);
    });

    test("should filter by channel", async () => {
      const messages = await t.query(api.messages.listUnread, { channel: "general" });

      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe("Unread 1");
    });

    test("should respect limit", async () => {
      const messages = await t.query(api.messages.listUnread, { limit: 1 });

      expect(messages.length).toBe(1);
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      await t.mutation(api.messages.ingestMessage, {
        content: "Hello world",
        channel: "general",
        tags: ["greeting"],
      });
      await t.mutation(api.messages.writeMessage, {
        content: "Hello there",
        channel: "general",
        tags: ["greeting"],
      });
      await t.mutation(api.messages.ingestMessage, {
        content: "Goodbye world",
        channel: "random",
        tags: ["farewell"],
      });
    });

    test("should search with regex pattern", async () => {
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          pattern: "^Hello",
        });
      });

      expect(result.messages.length).toBe(2);
      expect(result.messages.every((m: any) => m.content.startsWith("Hello"))).toBe(true);
    });

    test("should search with case-insensitive flag", async () => {
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          pattern: "hello",
          patternFlags: "i",
        });
      });

      expect(result.messages.length).toBe(2);
    });

    test("should filter by role", async () => {
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          role: "assistant",
        });
      });

      expect(result.messages.length).toBe(1);
      expect(result.messages[0].role).toBe("assistant");
    });

    test("should filter by tags (any match)", async () => {
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          tags: ["greeting"],
        });
      });

      expect(result.messages.length).toBe(2);
    });

    test("should filter by tagsAll (all must match)", async () => {
      await t.mutation(api.messages.ingestMessage, {
        content: "Multi-tagged",
        channel: "general",
        tags: ["greeting", "special"],
      });

      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          tagsAll: ["greeting", "special"],
        });
      });

      expect(result.messages.length).toBe(1);
      expect(result.messages[0].content).toBe("Multi-tagged");
    });

    test("should filter by channel", async () => {
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          channel: "random",
        });
      });

      expect(result.messages.length).toBe(1);
      expect(result.messages[0].channel).toBe("random");
    });

    test("should filter by read status", async () => {
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          read: false,
        });
      });

      expect(result.messages.length).toBe(2);
    });

    test("should respect limit", async () => {
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          limit: 2,
        });
      });

      expect(result.messages.length).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    test("should paginate with cursor", async () => {
      const page1 = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          limit: 2,
        });
      });

      expect(page1.messages.length).toBe(2);

      const page2 = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          limit: 2,
          cursor: page1.cursor,
        });
      });

      expect(page2.messages.length).toBe(1);
    });
  });

  describe("search with time filters", () => {
    test("should filter by since (numeric timestamp)", async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;

      await t.mutation(api.messages.ingestMessage, {
        content: "Recent message",
        channel: "general",
      });

      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          since: oneHourAgo,
        });
      });

      expect(result.messages.length).toBe(1);
    });

    test("should filter by until (numeric timestamp)", async () => {
      const now = Date.now();
      const futureTime = now + 60 * 60 * 1000;

      await t.mutation(api.messages.ingestMessage, {
        content: "Current message",
        channel: "general",
      });

      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          until: futureTime,
        });
      });

      expect(result.messages.length).toBe(1);
    });
  });

  describe("search with context queries", () => {
    let messages: any[] = [];

    beforeEach(async () => {
      const ids = [];
      for (let i = 1; i <= 5; i++) {
        const id = await t.mutation(api.messages.ingestMessage, {
          content: `Message ${i}`,
          channel: "general",
        });
        ids.push(id);
        await new Promise((r) => setTimeout(r, 10));
      }

      messages = [];
      for (const id of ids) {
        const msg = await t.query(api.messages.getMessage, { messageId: id });
        if (msg) messages.push(msg);
      }
    });

    test("should get messages before a target message", async () => {
      const targetId = messages[2]._id;
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          before: targetId,
          contextSize: 2,
        });
      });

      expect(result.messages.length).toBe(2);
    });

    test("should get messages after a target message", async () => {
      const targetId = messages[2]._id;
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          after: targetId,
          contextSize: 2,
        });
      });

      expect(result.messages.length).toBe(2);
    });

    test("should get messages around a target message (split context)", async () => {
      const targetId = messages[2]._id;
      const result = await t.run(async (ctx) => {
        return await ctx.runQuery(api.messages.search, {
          around: targetId,
          contextSize: 4,
        });
      });

      expect(result.messages.length).toBe(5);
      const targetInResult = result.messages.find((m: any) => m._id === targetId);
      expect(targetInResult).toBeDefined();
    });
  });
});

describe("parseRelativeTime helper", () => {
  const parseRelativeTime = (input: string): number | null => {
    const match = input.match(/^(\d+)(m|h|d|w)$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];
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
  };

  test("should parse minutes", () => {
    const result = parseRelativeTime("5m");
    expect(result).toBeDefined();
    const expected = Date.now() - 5 * 60 * 1000;
    expect(Math.abs(result! - expected)).toBeLessThan(100);
  });

  test("should parse hours", () => {
    const result = parseRelativeTime("1h");
    expect(result).toBeDefined();
    const expected = Date.now() - 60 * 60 * 1000;
    expect(Math.abs(result! - expected)).toBeLessThan(100);
  });

  test("should parse days", () => {
    const result = parseRelativeTime("2d");
    expect(result).toBeDefined();
    const expected = Date.now() - 2 * 24 * 60 * 60 * 1000;
    expect(Math.abs(result! - expected)).toBeLessThan(100);
  });

  test("should parse weeks", () => {
    const result = parseRelativeTime("1w");
    expect(result).toBeDefined();
    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(result! - expected)).toBeLessThan(100);
  });

  test("should return null for invalid format", () => {
    expect(parseRelativeTime("invalid")).toBeNull();
    expect(parseRelativeTime("5x")).toBeNull();
    expect(parseRelativeTime("m")).toBeNull();
    expect(parseRelativeTime("")).toBeNull();
  });
});
