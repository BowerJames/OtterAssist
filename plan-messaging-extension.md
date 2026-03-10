# Messaging Extension Plan

## Overview

A simple bidirectional messaging extension that enables communication between the user and the AI agent via a SQLite database. Both user and agent interact with the database using `usql`.

## Design Principles

- **No custom tools** - Agent uses existing `bash` tool with `usql`
- **SQLite as interface** - All interactions through the database
- **Event-driven** - New user messages trigger agent events
- **Self-documenting** - Skill teaches agent the usql commands

---

## Database Schema

**Location**: `~/.otterassist/messages.db`

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,              -- UUID
  role TEXT NOT NULL,               -- 'user' | 'agent'
  content TEXT NOT NULL,            -- Message content
  parent_id TEXT,                   -- For threaded conversations (NULL = new thread)
  status TEXT NOT NULL,             -- 'unread' | 'read' | 'responded'
  created_at TEXT NOT NULL,         -- ISO timestamp
  
  FOREIGN KEY (parent_id) REFERENCES messages(id)
);

CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_parent ON messages(parent_id);
CREATE INDEX idx_messages_created ON messages(created_at);
```

---

## Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Message Lifecycle                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. User adds message via usql                                      │
│     └─► role='user', status='unread', parent_id=NULL                │
│                                                                      │
│  2. Extension polls, finds unread user messages                     │
│     └─► Creates event: "You have a new message (ID: xxx)"           │
│     └─► Updates status to 'read' (marks as being processed)         │
│                                                                      │
│  3. Agent processes the message                                     │
│     └─► Uses usql via bash tool to read message and get context     │
│     └─► Uses usql to insert response                                │
│     └─► Uses usql to mark original as 'responded'                   │
│                                                                      │
│  4. Event marked complete                                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Extension Structure

```
~/.otterassist/extensions/messaging/
├── index.ts           # Main extension (event source + skill)
├── database.ts        # SQLite message database operations
├── types.ts           # TypeScript interfaces
└── README.md          # Documentation for users
```

---

## TypeScript Interfaces

```typescript
// types.ts

export interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  parentId: string | null;
  status: "unread" | "read" | "responded";
  createdAt: Date;
}

export interface MessagingConfig {
  /** Path to messages database (default: ~/.otterassist/messages.db) */
  dbPath?: string;
}

export interface MessageDatabase {
  getUnread(): Promise<Message[]>;
  getById(id: string): Promise<Message | null>;
  markRead(id: string): Promise<void>;
  close(): void;
}
```

---

## Extension Implementation

### index.ts

```typescript
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

  events: {
    async initialize(cfg: MessagingConfig, context: OAExtensionContext) {
      dbPath = cfg.dbPath ?? `${context.configDir}/messages.db`;
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
      return unread.map(msg => 
        `💬 You have a new message from the user.

Message ID: ${msg.id}
Created: ${msg.createdAt.toLocaleString()}

Content:
${msg.content}

---

Please read this message, understand what the user is asking, and respond appropriately.

Use the messaging skill to learn how to query the messages database and insert your response.`
      );
    },

    async shutdown() {
      db?.close();
      logger?.info("Messaging extension shut down");
    }
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
`
    });
  }
} satisfies OtterAssistExtension;
```

---

## Database Implementation

### database.ts

```typescript
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "otterassist";
import type { Message, MessageDatabase as IMessageDatabase } from "./types.ts";

interface MessageRow {
  id: string;
  role: string;
  content: string;
  parent_id: string | null;
  status: string;
  created_at: string;
}

export class MessageDatabase implements IMessageDatabase {
  private db: Database;
  private logger: Logger;

  private constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  static async create(dbPath: string, logger: Logger): Promise<MessageDatabase> {
    await mkdir(dirname(dbPath), { recursive: true });
    
    const db = new Database(dbPath);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
        content TEXT NOT NULL,
        parent_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('unread', 'read', 'responded')),
        created_at TEXT NOT NULL,
        
        FOREIGN KEY (parent_id) REFERENCES messages(id)
      )
    `);
    
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)`);
    
    logger.debug(`Message database initialized at ${dbPath}`);
    
    return new MessageDatabase(db, logger);
  }

  async getUnread(): Promise<Message[]> {
    const stmt = this.db.query<MessageRow, []>(
      `SELECT * FROM messages WHERE role = 'user' AND status = 'unread' ORDER BY created_at ASC`
    );
    return stmt.all().map(this.rowToMessage);
  }

  async getById(id: string): Promise<Message | null> {
    const stmt = this.db.query<MessageRow, [string]>(
      `SELECT * FROM messages WHERE id = ?`
    );
    const row = stmt.get(id);
    return row ? this.rowToMessage(row) : null;
  }

  async markRead(id: string): Promise<void> {
    this.db.run(
      `UPDATE messages SET status = 'read' WHERE id = ?`,
      [id]
    );
  }

  close(): void {
    this.db.close();
  }

  private rowToMessage(row: MessageRow): Message {
    return {
      id: row.id,
      role: row.role as "user" | "agent",
      content: row.content,
      parentId: row.parent_id,
      status: row.status as "unread" | "read" | "responded",
      createdAt: new Date(row.created_at)
    };
  }
}
```

---

## User Usage

### Send a message

```bash
# Generate UUID and insert message
usql ~/.otterassist/messages.db -c "
  INSERT INTO messages (id, role, content, parent_id, status, created_at)
  VALUES (
    '$(uuidgen | tr 'A-Z' 'a-z')',
    'user',
    'Can you review the latest PR?',
    NULL,
    'unread',
    datetime('now')
  )
"
```

### Check for responses

```bash
# View recent messages
usql ~/.otterassist/messages.db -c "
  SELECT id, role, substr(content, 1, 80) as preview, created_at 
  FROM messages 
  ORDER BY created_at DESC 
  LIMIT 10
"

# Read full response
usql ~/.otterassist/messages.db -c "SELECT content FROM messages WHERE id = '<ID>'"
```

### Continue a conversation

```bash
# Reply to an agent message (use its ID as parent_id)
usql ~/.otterassist/messages.db -c "
  INSERT INTO messages (id, role, content, parent_id, status, created_at)
  VALUES (
    '$(uuidgen | tr 'A-Z' 'a-z')',
    'user',
    'Thanks! Can you also check the tests?',
    '<AGENT_MESSAGE_ID>',
    'unread',
    datetime('now')
  )
"
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `~/.otterassist/extensions/messaging/index.ts` | Main extension |
| `~/.otterassist/extensions/messaging/database.ts` | SQLite operations |
| `~/.otterassist/extensions/messaging/types.ts` | TypeScript interfaces |
| `~/.otterassist/extensions/messaging/README.md` | User documentation |

---

## Implementation Checklist

- [ ] Create `types.ts` with interfaces
- [ ] Create `database.ts` with SQLite operations
- [ ] Create `index.ts` with event source + skill
- [ ] Create `README.md` with user instructions
- [ ] Test: send message via usql → verify event triggers → agent responds
