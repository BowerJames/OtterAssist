/**
 * TypeScript interfaces for the messaging extension
 */

/**
 * A message in the conversation
 */
export interface Message {
  /** Unique identifier (UUID) */
  id: string;
  /** Who sent the message */
  role: "user" | "agent";
  /** Message content */
  content: string;
  /** Parent message ID for threading (null = new thread) */
  parentId: string | null;
  /** Message status */
  status: "unread" | "read" | "responded";
  /** When the message was created */
  createdAt: Date;
}

/**
 * Extension configuration
 */
export interface MessagingConfig {
  /** Path to messages database (default: ~/.otterassist/messages.db) */
  dbPath?: string;
}

/**
 * Database interface for message operations
 */
export interface MessageDatabase {
  /** Get all unread user messages */
  getUnread(): Promise<Message[]>;

  /** Get a specific message by ID */
  getById(id: string): Promise<Message | null>;

  /** Mark a message as read */
  markRead(id: string): Promise<void>;

  /** Close the database connection */
  close(): void;
}
