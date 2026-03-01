import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../convex/_generated/dataModel";
import type { Tool, ToolResult } from "./types";
import { getConvexUrl } from "./env";
import { api } from "../../convex/_generated/api";

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (!client) {
    client = new ConvexHttpClient(getConvexUrl());
  }
  return client;
}

function formatMessage(msg: {
  _id: string;
  _creationTime: number;
  content: string;
  role: string;
  channel: string;
  read: boolean;
  tags?: string[];
}): string {
  const timestamp = new Date(msg._creationTime).toISOString();
  const tags = msg.tags?.length ? ` [${msg.tags.join(", ")}]` : "";
  const readStatus = msg.read ? "" : " (unread)";
  return `[${timestamp}] ${msg.role}${tags}: ${msg.content}${readStatus}`;
}

export const searchMessagesTool: Tool = {
  name: "search_messages",
  description:
    "Search messages with various filters including pattern matching, time ranges, tags, and channel. Supports regex patterns and relative time expressions (e.g., '1h', '2d', '1w').",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Search pattern (regex supported)",
      },
      patternFlags: {
        type: "string",
        description: "Regex flags (e.g., 'i' for case-insensitive)",
      },
      channel: {
        type: "string",
        description: "Filter by channel",
      },
      role: {
        type: "string",
        enum: ["user", "assistant", "system"],
        description: "Filter by role",
      },
      read: {
        type: "boolean",
        description: "Filter by read status",
      },
      tags: {
        type: "array",
        items: { type: "string", description: "A tag" },
        description: "Filter to messages with any of these tags",
      },
      tagsAll: {
        type: "array",
        items: { type: "string", description: "A tag" },
        description: "Filter to messages with all of these tags",
      },
      last: {
        type: "string",
        description: "Relative time (e.g., '1h', '2d', '1w')",
      },
      since: {
        type: "string",
        description: "Start time (timestamp or relative time)",
      },
      until: {
        type: "string",
        description: "End time (timestamp or relative time)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 100)",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor from previous results",
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const result = await getClient().query(api.messages.search, {
        pattern: args.pattern as string | undefined,
        patternFlags: args.patternFlags as string | undefined,
        channel: args.channel as string | undefined,
        role: args.role as "user" | "assistant" | "system" | undefined,
        read: args.read as boolean | undefined,
        tags: args.tags as string[] | undefined,
        tagsAll: args.tagsAll as string[] | undefined,
        last: args.last as string | undefined,
        since: args.since as string | number | undefined,
        until: args.until as string | number | undefined,
        limit: args.limit as number | undefined,
        cursor: args.cursor as string | null | undefined,
      });

      if (!result.messages || result.messages.length === 0) {
        return { success: true, output: "No messages found." };
      }

      const lines = result.messages.map(formatMessage);
      let output = lines.join("\n");

      if (result.hasMore) {
        output += `\n\n--- More results available. Use cursor: ${result.cursor} ---`;
      }

      return { success: true, output };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Search failed: ${errorMessage}` };
    }
  },
};

export const listUnreadTool: Tool = {
  name: "list_unread",
  description: "List unread messages, optionally filtered by channel.",
  parameters: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        description: "Filter by channel",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 100)",
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const messages = await getClient().query(api.messages.listUnread, {
        channel: args.channel as string | undefined,
        limit: args.limit as number | undefined,
      });

      if (!messages || messages.length === 0) {
        return { success: true, output: "No unread messages." };
      }

      const lines = messages.map(formatMessage);
      return { success: true, output: lines.join("\n") };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to list unread: ${errorMessage}` };
    }
  },
};

export const getMessageTool: Tool = {
  name: "get_message",
  description: "Retrieve a single message by its ID.",
  parameters: {
    type: "object",
    properties: {
      messageId: {
        type: "string",
        description: "The message ID",
      },
    },
    required: ["messageId"],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const message = await getClient().query(api.messages.getMessage, {
        messageId: args.messageId as Id<"messages">,
      });

      if (!message) {
        return { success: false, error: `Message not found: ${args.messageId}` };
      }

      return { success: true, output: formatMessage(message as any) };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to get message: ${errorMessage}` };
    }
  },
};

export const writeMessageTool: Tool = {
  name: "write_message",
  description: "Create a new assistant message in a channel.",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The message content",
      },
      channel: {
        type: "string",
        description: "The channel to post to",
      },
      tags: {
        type: "array",
        items: { type: "string", description: "A tag" },
        description: "Optional tags for the message",
      },
      metadata: {
        type: "object",
        description: "Optional metadata object",
      },
    },
    required: ["content", "channel"],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const messageId = await getClient().mutation(api.messages.writeMessage, {
        content: args.content as string,
        channel: args.channel as string,
        tags: args.tags as string[] | undefined,
        metadata: args.metadata as Record<string, unknown> | undefined,
      });

      return { success: true, output: `Message created with ID: ${messageId}` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to write message: ${errorMessage}` };
    }
  },
};

export const markReadTool: Tool = {
  name: "mark_read",
  description: "Mark a message as read.",
  parameters: {
    type: "object",
    properties: {
      messageId: {
        type: "string",
        description: "The message ID to mark as read",
      },
    },
    required: ["messageId"],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      await getClient().mutation(api.messages.markRead, {
        messageId: args.messageId as Id<"messages">,
      });

      return { success: true, output: `Message ${args.messageId} marked as read.` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to mark read: ${errorMessage}` };
    }
  },
};
