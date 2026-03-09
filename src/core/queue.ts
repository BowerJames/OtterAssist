/**
 * Event Queue implementation using SQLite
 * @see Issue #2
 */

import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import type { Event, EventQueue, Logger } from "../types/index.ts";

/** Row type from the events table */
interface EventRow {
  id: string;
  message: string;
  progress: string;
  createdAt: string;
  status: string;
}

/**
 * SQLite-based event queue implementation
 */
export class SQLiteEventQueue implements EventQueue {
  private db: Database;
  private logger: Logger;

  private constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Creates a new SQLiteEventQueue instance
   * @param dbPath - Path to the SQLite database file (default: ~/.otterassist/events.db)
   * @param logger - Logger instance for debug output
   */
  static async create(
    dbPath = `${homedir()}/.otterassist/events.db`,
    logger: Logger,
  ): Promise<SQLiteEventQueue> {
    // Ensure directory exists
    await mkdir(dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);

    // Create events table if it doesn't exist
    db.run(`
			CREATE TABLE IF NOT EXISTS events (
				id TEXT PRIMARY KEY,
				message TEXT NOT NULL,
				progress TEXT DEFAULT '',
				createdAt TEXT NOT NULL,
				status TEXT NOT NULL CHECK(status IN ('pending', 'completed'))
			)
		`);

    // Create index on status for faster pending queries
    db.run(`
			CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)
		`);

    logger.debug(`Event queue initialized at ${dbPath}`);

    return new SQLiteEventQueue(db, logger);
  }

  /**
   * Adds a new event to the queue
   */
  async add(message: string): Promise<Event> {
    const event: Event = {
      id: randomUUID(),
      message,
      progress: "",
      createdAt: new Date(),
      status: "pending",
    };

    this.db.run(
      `INSERT INTO events (id, message, progress, createdAt, status) VALUES (?, ?, ?, ?, ?)`,
      [
        event.id,
        event.message,
        event.progress,
        event.createdAt.toISOString(),
        event.status,
      ],
    );

    this.logger.debug(`Added event ${event.id}: ${message}`);

    return event;
  }

  /**
   * Gets all pending events from the queue
   */
  async getPending(): Promise<Event[]> {
    const stmt = this.db.query<EventRow, [string]>(
      `SELECT * FROM events WHERE status = ? ORDER BY createdAt ASC`,
    );
    const rows = stmt.all("pending");

    return rows.map((row) => this.rowToEvent(row));
  }

  /**
   * Gets a single event by ID
   */
  async getById(id: string): Promise<Event | null> {
    const stmt = this.db.query<EventRow, [string]>(
      `SELECT * FROM events WHERE id = ?`,
    );
    const row = stmt.get(id);

    return row ? this.rowToEvent(row) : null;
  }

  /**
   * Updates the progress field of an event
   */
  async updateProgress(id: string, progress: string): Promise<void> {
    const result = this.db.run(`UPDATE events SET progress = ? WHERE id = ?`, [
      progress,
      id,
    ]);

    if (result.changes === 0) {
      throw new Error(`Event not found: ${id}`);
    }

    this.logger.debug(`Updated progress for event ${id}: ${progress}`);
  }

  /**
   * Marks an event as completed
   */
  async markComplete(id: string): Promise<void> {
    const result = this.db.run(
      `UPDATE events SET status = 'completed' WHERE id = ?`,
      [id],
    );

    if (result.changes === 0) {
      throw new Error(`Event not found: ${id}`);
    }

    this.logger.info(`Marked event ${id} as completed`);
  }

  /**
   * Purges completed events older than the given date
   * @returns Number of events purged
   */
  async purgeCompleted(olderThan: Date): Promise<number> {
    const result = this.db.run(
      `DELETE FROM events WHERE status = 'completed' AND createdAt < ?`,
      [olderThan.toISOString()],
    );

    this.logger.info(
      `Purged ${result.changes} completed events older than ${olderThan.toISOString()}`,
    );

    return result.changes;
  }

  /**
   * Closes the database connection
   */
  close(): void {
    this.db.close();
    this.logger.debug("Event queue database connection closed");
  }

  /**
   * Converts a database row to an Event object
   */
  private rowToEvent(row: EventRow): Event {
    return {
      id: row.id,
      message: row.message,
      progress: row.progress,
      createdAt: new Date(row.createdAt),
      status: row.status as "pending" | "completed",
    };
  }
}
