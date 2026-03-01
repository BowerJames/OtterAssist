import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import {
  searchMessagesTool,
  listUnreadTool,
  getMessageTool,
  writeMessageTool,
  markReadTool,
} from "../convex";

describe("convex tools", () => {
  const originalEnv = process.env.CONVEX_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONVEX_URL = originalEnv;
    } else {
      delete process.env.CONVEX_URL;
    }
  });

  describe("search_messages", () => {
    test("has correct tool name", () => {
      expect(searchMessagesTool.name).toBe("search_messages");
    });

    test("has description", () => {
      expect(searchMessagesTool.description).toContain("Search messages");
    });

    test("has required parameters defined", () => {
      expect(searchMessagesTool.parameters.type).toBe("object");
      expect(searchMessagesTool.parameters.properties).toHaveProperty("pattern");
      expect(searchMessagesTool.parameters.properties).toHaveProperty("channel");
      expect(searchMessagesTool.parameters.properties).toHaveProperty("tags");
      expect(searchMessagesTool.parameters.properties).toHaveProperty("limit");
    });

    test("has no required parameters", () => {
      expect(searchMessagesTool.parameters.required).toEqual([]);
    });

    test("handles CONVEX_URL not set", async () => {
      delete process.env.CONVEX_URL;
      const result = await searchMessagesTool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain("CONVEX_URL");
    });
  });

  describe("list_unread", () => {
    test("has correct tool name", () => {
      expect(listUnreadTool.name).toBe("list_unread");
    });

    test("has description", () => {
      expect(listUnreadTool.description).toContain("unread");
    });

    test("has channel and limit parameters", () => {
      expect(listUnreadTool.parameters.properties).toHaveProperty("channel");
      expect(listUnreadTool.parameters.properties).toHaveProperty("limit");
    });

    test("has no required parameters", () => {
      expect(listUnreadTool.parameters.required).toEqual([]);
    });

    test("handles CONVEX_URL not set", async () => {
      delete process.env.CONVEX_URL;
      const result = await listUnreadTool.execute({});
      expect(result.success).toBe(false);
      expect(result.error).toContain("CONVEX_URL");
    });
  });

  describe("get_message", () => {
    test("has correct tool name", () => {
      expect(getMessageTool.name).toBe("get_message");
    });

    test("has description", () => {
      expect(getMessageTool.description).toContain("single message");
    });

    test("requires messageId parameter", () => {
      expect(getMessageTool.parameters.required).toContain("messageId");
    });

    test("handles CONVEX_URL not set", async () => {
      delete process.env.CONVEX_URL;
      const result = await getMessageTool.execute({ messageId: "msg1" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("CONVEX_URL");
    });
  });

  describe("write_message", () => {
    test("has correct tool name", () => {
      expect(writeMessageTool.name).toBe("write_message");
    });

    test("has description", () => {
      expect(writeMessageTool.description).toContain("assistant message");
    });

    test("requires content and channel parameters", () => {
      expect(writeMessageTool.parameters.required).toContain("content");
      expect(writeMessageTool.parameters.required).toContain("channel");
    });

    test("has optional tags and metadata parameters", () => {
      expect(writeMessageTool.parameters.properties).toHaveProperty("tags");
      expect(writeMessageTool.parameters.properties).toHaveProperty("metadata");
    });

    test("handles CONVEX_URL not set", async () => {
      delete process.env.CONVEX_URL;
      const result = await writeMessageTool.execute({
        content: "test",
        channel: "general",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("CONVEX_URL");
    });
  });

  describe("mark_read", () => {
    test("has correct tool name", () => {
      expect(markReadTool.name).toBe("mark_read");
    });

    test("has description", () => {
      expect(markReadTool.description).toContain("read");
    });

    test("requires messageId parameter", () => {
      expect(markReadTool.parameters.required).toContain("messageId");
    });

    test("handles CONVEX_URL not set", async () => {
      delete process.env.CONVEX_URL;
      const result = await markReadTool.execute({ messageId: "msg1" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("CONVEX_URL");
    });
  });
});
