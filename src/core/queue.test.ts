/**
 * Tests for SQLite Event Queue
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Logger } from "../types/index.ts";
import { SQLiteEventQueue } from "./queue.ts";

const TEST_DIR = join(homedir(), ".otterassist", "__test_queue__");
const TEST_DB_PATH = join(TEST_DIR, "test-events.db");

// Mock logger
const createMockLogger = (): Logger => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

async function createTestDir(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  await rm(TEST_DIR, { recursive: true, force: true });
}

describe("SQLiteEventQueue", () => {
  let queue: SQLiteEventQueue;
  let mockLogger: Logger;

  beforeEach(async () => {
    await cleanupTestDir();
    await createTestDir();
    mockLogger = createMockLogger();
    queue = await SQLiteEventQueue.create(TEST_DB_PATH, mockLogger);
  });

  afterEach(async () => {
    queue.close();
    await cleanupTestDir();
  });

  describe("create", () => {
    it("should create a new queue with database file", async () => {
      const newQueue = await SQLiteEventQueue.create(
        join(TEST_DIR, "new-queue.db"),
        mockLogger,
      );

      expect(newQueue).toBeDefined();
      newQueue.close();
    });

    it("should create database directory if it doesn't exist", async () => {
      const nestedPath = join(TEST_DIR, "nested", "deep", "queue.db");
      const newQueue = await SQLiteEventQueue.create(nestedPath, mockLogger);

      expect(newQueue).toBeDefined();
      newQueue.close();
    });

    it("should create events table on initialization", async () => {
      // Queue is already created in beforeEach
      // Verify by adding and retrieving an event
      const event = await queue.add("test event");
      expect(event).toBeDefined();
    });
  });

  describe("add", () => {
    it("should add a new event to the queue", async () => {
      const event = await queue.add("Test event message");

      expect(event.id).toBeDefined();
      expect(event.message).toBe("Test event message");
      expect(event.progress).toBe("");
      expect(event.status).toBe("pending");
      expect(event.createdAt).toBeInstanceOf(Date);
    });

    it("should generate unique IDs for events", async () => {
      const event1 = await queue.add("Event 1");
      const event2 = await queue.add("Event 2");

      expect(event1.id).not.toBe(event2.id);
    });

    it("should store events persistently", async () => {
      const event = await queue.add("Persistent event");

      // Retrieve to verify persistence
      const retrieved = await queue.getById(event.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.message).toBe("Persistent event");
    });
  });

  describe("getPending", () => {
    it("should return empty array when no pending events", async () => {
      const pending = await queue.getPending();
      expect(pending).toEqual([]);
    });

    it("should return all pending events", async () => {
      await queue.add("Event 1");
      await queue.add("Event 2");
      await queue.add("Event 3");

      const pending = await queue.getPending();

      expect(pending.length).toBe(3);
      expect(pending.map((e) => e.message).sort()).toEqual([
        "Event 1",
        "Event 2",
        "Event 3",
      ]);
    });

    it("should not return completed events", async () => {
      const event = await queue.add("To be completed");
      await queue.markComplete(event.id);

      const pending = await queue.getPending();
      expect(pending.length).toBe(0);
    });

    it("should return events ordered by createdAt ascending", async () => {
      // Add events with small delays to ensure different timestamps
      await queue.add("First");
      await new Promise((r) => setTimeout(r, 10));
      await queue.add("Second");
      await new Promise((r) => setTimeout(r, 10));
      await queue.add("Third");

      const pending = await queue.getPending();

      expect(pending[0]?.message).toBe("First");
      expect(pending[1]?.message).toBe("Second");
      expect(pending[2]?.message).toBe("Third");
    });
  });

  describe("getById", () => {
    it("should return event by ID", async () => {
      const event = await queue.add("Find me");
      const found = await queue.getById(event.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(event.id);
      expect(found?.message).toBe("Find me");
    });

    it("should return null for non-existent ID", async () => {
      const found = await queue.getById("non-existent-id");
      expect(found).toBeNull();
    });

    it("should return event with correct status", async () => {
      const event = await queue.add("Status test");
      await queue.markComplete(event.id);

      const found = await queue.getById(event.id);
      expect(found?.status).toBe("completed");
    });
  });

  describe("updateProgress", () => {
    it("should update progress field of an event", async () => {
      const event = await queue.add("Progress test");
      await queue.updateProgress(event.id, "50% complete");

      const updated = await queue.getById(event.id);
      expect(updated?.progress).toBe("50% complete");
    });

    it("should throw error for non-existent event", async () => {
      await expect(
        queue.updateProgress("non-existent", "progress"),
      ).rejects.toThrow("Event not found: non-existent");
    });

    it("should allow overwriting existing progress", async () => {
      const event = await queue.add("Overwrite test");
      await queue.updateProgress(event.id, "First progress");
      await queue.updateProgress(event.id, "Updated progress");

      const updated = await queue.getById(event.id);
      expect(updated?.progress).toBe("Updated progress");
    });
  });

  describe("markComplete", () => {
    it("should mark an event as completed", async () => {
      const event = await queue.add("Complete me");
      await queue.markComplete(event.id);

      const completed = await queue.getById(event.id);
      expect(completed?.status).toBe("completed");
    });

    it("should remove event from pending list", async () => {
      const event = await queue.add("To complete");
      await queue.markComplete(event.id);

      const pending = await queue.getPending();
      expect(pending.find((e) => e.id === event.id)).toBeUndefined();
    });

    it("should throw error for non-existent event", async () => {
      await expect(queue.markComplete("non-existent")).rejects.toThrow(
        "Event not found: non-existent",
      );
    });

    it("should be idempotent (safe to call multiple times)", async () => {
      const event = await queue.add("Idempotent test");
      await queue.markComplete(event.id);
      await queue.markComplete(event.id); // Should not throw

      const completed = await queue.getById(event.id);
      expect(completed?.status).toBe("completed");
    });
  });

  describe("purgeCompleted", () => {
    it("should purge completed events older than given date", async () => {
      const event = await queue.add("Old event");
      await queue.markComplete(event.id);

      // Purge events older than tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const purged = await queue.purgeCompleted(tomorrow);

      expect(purged).toBe(1);
      const found = await queue.getById(event.id);
      expect(found).toBeNull();
    });

    it("should not purge pending events", async () => {
      await queue.add("Pending event");

      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const purged = await queue.purgeCompleted(futureDate);

      expect(purged).toBe(0);
      const pending = await queue.getPending();
      expect(pending.length).toBe(1);
    });

    it("should not purge recently completed events if olderThan is in past", async () => {
      const event = await queue.add("Recent completed");
      await queue.markComplete(event.id);

      // Purge events older than yesterday (won't match today's event)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const purged = await queue.purgeCompleted(yesterday);

      expect(purged).toBe(0);
      const found = await queue.getById(event.id);
      expect(found).not.toBeNull();
    });

    it("should return count of purged events", async () => {
      const event1 = await queue.add("Event 1");
      const event2 = await queue.add("Event 2");
      const event3 = await queue.add("Event 3");

      await queue.markComplete(event1.id);
      await queue.markComplete(event2.id);
      await queue.markComplete(event3.id);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const purged = await queue.purgeCompleted(tomorrow);

      expect(purged).toBe(3);
    });
  });

  describe("close", () => {
    it("should close the database connection", async () => {
      const localQueue = await SQLiteEventQueue.create(
        join(TEST_DIR, "close-test.db"),
        mockLogger,
      );

      // Should not throw
      localQueue.close();

      // Note: Further operations would fail, but we can't easily test that
    });
  });

  describe("concurrent access", () => {
    it("should handle multiple concurrent adds", async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(queue.add(`Concurrent event ${i}`));
      }

      const events = await Promise.all(promises);

      expect(events.length).toBe(10);
      expect(new Set(events.map((e) => e.id)).size).toBe(10); // All unique IDs

      const pending = await queue.getPending();
      expect(pending.length).toBe(10);
    });
  });
});
