/**
 * Messaging Extension
 *
 * Enables bidirectional communication between the user and the AI agent
 * via a SQLite database. Both user and agent interact using usql.
 *
 * Features:
 * - User can leave messages for the agent via usql
 * - Agent receives events when new messages arrive
 * - Agent reads and responds using usql via the bash tool
 * - Threaded conversations supported via parent_id
 * - Skill teaches agent how to use the messaging system
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OtterAssistExtension, OAExtensionContext } from "otterassist";
import { MessageDatabase } from "./database.ts";
import type { MessagingConfig } from "./types.ts";

let db: MessageDatabase;
let dbPath: string;
let logger: OAExtensionContext["logger"];

export default {
  name: "messaging",
  description: "Bidirectional messaging between user and agent via SQLite",
  version: "1.0.0",

  defaultConfig: {},

  events: {
    async initialize(cfg: MessagingConfig, context: OAExtensionContext) {
      dbPath = cfg?.dbPath ?? `${context.configDir}/messages.db`;
      logger = context.logger;

      db = await MessageDatabase.create(dbPath, logger);
      logger.info("Messaging extension initialized");
      logger.debug(`Database: ${dbPath}`);
    },

    async poll() {
      const unread = await db.getUnread();

      if (unread.length === 0) {
        return [];
      }

      // Mark as read to avoid duplicate events
      for (const msg of unread) {
        await db.markRead(msg.id);
      }

      // One event per message
      return unread.map(
        (msg) =>
          `💬 You have a new message from the user.

Message ID: ${msg.id}
Created: ${msg.createdAt.toLocaleString()}

Content:
${msg.content}

---

Please read this message, understand what the user is asking, and respond appropriately.

Use the messaging skill to learn how to query the messages database and insert your response.`,
      );
    },

    async shutdown() {
      db?.close();
      logger?.info("Messaging extension shut down");
    },
  },

  piExtension(pi: ExtensionAPI) {
    pi.registerSkill?.({
      name: "messaging",
      description: "Guide for using the messaging system with usql",
      content: `# Messaging System

## Database Location

\`\`\`
~/.otterassist/messages.db
\`\`\`

## Schema

\`\`\`sql
messages (
  id         TEXT PRIMARY KEY,  -- UUID
  role       TEXT,              -- 'user' or 'agent'
  content    TEXT,              -- Message content
  parent_id  TEXT,              -- Thread parent (NULL = new thread)
  status     TEXT,              -- 'unread', 'read', 'responded'
  created_at TEXT               -- ISO timestamp
)
\`\`\`

## Reading Messages

### Read the current message
\`\`\`bash
usql ~/.otterassist/messages.db -c "SELECT * FROM messages WHERE id = '<MESSAGE_ID>'"
\`\`\`

### Get conversation thread (if message has parent_id)
\`\`\`bash
# First check if there's a parent
usql ~/.otterassist/messages.db -c "SELECT parent_id FROM messages WHERE id = '<MESSAGE_ID>'"

# If parent_id exists, get the full thread
usql ~/.otterassist/messages.db -c "
  WITH RECURSIVE thread AS (
    SELECT * FROM messages WHERE id = '<PARENT_ID>'
    UNION ALL
    SELECT m.* FROM messages m
    INNER JOIN thread t ON m.parent_id = t.id
  )
  SELECT role, content, created_at FROM thread ORDER BY created_at
"
\`\`\`

### View recent messages for context
\`\`\`bash
usql ~/.otterassist/messages.db -c "SELECT id, role, substr(content, 1, 100), created_at FROM messages ORDER BY created_at DESC LIMIT 10"
\`\`\`

## Responding to Messages

When you respond to a message, you must:

1. **Insert your response** with the original message ID as parent_id
2. **Mark the original as responded**

### Generate a UUID for your response
\`\`\`bash
uuidgen | tr 'A-Z' 'a-z'
\`\`\`

### Insert your response
\`\`\`bash
usql ~/.otterassist/messages.db -c "
  INSERT INTO messages (id, role, content, parent_id, status, created_at)
  VALUES (
    '<NEW_UUID>',
    'agent',
    'Your response text here...',
    '<ORIGINAL_MESSAGE_ID>',
    'responded',
    datetime('now')
  )
"
\`\`\`

### Mark original message as responded
\`\`\`bash
usql ~/.otterassist/messages.db -c "UPDATE messages SET status = 'responded' WHERE id = '<ORIGINAL_MESSAGE_ID>'"
\`\`\`

## Example Workflow

\`\`\`bash
# 1. Read the message you're responding to
usql ~/.otterassist/messages.db -c "SELECT * FROM messages WHERE id = 'abc-123'"

# 2. Check for thread context (optional)
usql ~/.otterassist/messages.db -c "SELECT parent_id FROM messages WHERE id = 'abc-123'"

# 3. Generate UUID for response
RESPONSE_ID=$(uuidgen | tr 'A-Z' 'a-z')

# 4. Insert your response
usql ~/.otterassist/messages.db -c "
  INSERT INTO messages (id, role, content, parent_id, status, created_at)
  VALUES ('$RESPONSE_ID', 'agent', 'I reviewed the PR and left comments...', 'abc-123', 'responded', datetime('now'))
"

# 5. Mark original as responded
usql ~/.otterassist/messages.db -c "UPDATE messages SET status = 'responded' WHERE id = 'abc-123'"
\`\`\`

## Guidelines

- Always check for thread context before responding
- Be thorough and address all points the user raises
- Use proper threading (parent_id) so conversations stay organized
- Always mark the original message as 'responded' after inserting your response
- You can use multi-line content in SQL by escaping newlines or using heredocs
`,
    });
  },
} satisfies OtterAssistExtension;
