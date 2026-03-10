/**
 * SQLite database operations for the messaging extension
 */

import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "otterassist";
import type { Message, MessageDatabase as IMessageDatabase } from "./types.ts";

/** Raw database row type */
interface MessageRow {
  id: string;
  role: string;
  content: string;
  parent_id: string | null;
  status: string;
  created_at: string;
}

/**
 * SQLite-based message database
 */
export class MessageDatabase implements IMessageDatabase {
  private db: Database;
  private logger: Logger;

  private constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Create and initialize the message database
   */
  static async create(dbPath: string, logger: Logger): Promise<MessageDatabase> {
    // Ensure directory exists
    await mkdir(dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);

    // Create messages table
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

    // Create indexes for common queries
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)`,
    );

    logger.debug(`Message database initialized at ${dbPath}`);

    return new MessageDatabase(db, logger);
  }

  /**
   * Get all unread user messages
   */
  async getUnread(): Promise<Message[]> {
    const stmt = this.db.query<MessageRow, []>(
      `SELECT * FROM messages WHERE role = 'user' AND status = 'unread' ORDER BY created_at ASC`,
    );
    return stmt.all().map((row) => this.rowToMessage(row));
  }

  /**
   * Get a specific message by ID
   */
  async getById(id: string): Promise<Message | null> {
    const stmt = this.db.query<MessageRow, [string]>(
      `SELECT * FROM messages WHERE id = ?`,
    );
    const row = stmt.get(id);
    return row ? this.rowToMessage(row) : null;
  }

  /**
   * Mark a message as read
   */
  async markRead(id: string): Promise<void> {
    this.db.run(`UPDATE messages SET status = 'read' WHERE id = ?`, [id]);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert a database row to a Message object
   */
  private rowToMessage(row: MessageRow): Message {
    return {
      id: row.id,
      role: row.role as "user" | "agent",
      content: row.content,
      parentId: row.parent_id,
      status: row.status as "unread" | "read" | "responded",
      createdAt: new Date(row.created_at),
    };
  }
}
