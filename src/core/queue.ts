/**
 * Event Queue implementation using SQLite
 * @see Issue #2
 */

import type { Event, EventQueue } from "../types/index.ts";

// Placeholder - will be implemented in Issue #2
export class SQLiteEventQueue implements EventQueue {
  async add(_message: string): Promise<Event> {
    throw new Error("Not implemented - Issue #2");
  }

  async getPending(): Promise<Event[]> {
    throw new Error("Not implemented - Issue #2");
  }

  async getById(_id: string): Promise<Event | null> {
    throw new Error("Not implemented - Issue #2");
  }

  async updateProgress(_id: string, _progress: string): Promise<void> {
    throw new Error("Not implemented - Issue #2");
  }

  async markComplete(_id: string): Promise<void> {
    throw new Error("Not implemented - Issue #2");
  }

  async purgeCompleted(_olderThan: Date): Promise<number> {
    throw new Error("Not implemented - Issue #2");
  }
}
