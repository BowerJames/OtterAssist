import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { TrajectoryLogger, readTrajectory } from "../trajectoryLogger";
import { join } from "node:path";
import { homedir } from "node:os";

describe("TrajectoryLogger", () => {
  let tempDir: string;
  let logger: TrajectoryLogger;

  beforeEach(async () => {
    tempDir = join(
      await Bun.$`mktemp -d`.text().then((s) => s.trim()),
      "trajectories"
    );
    logger = new TrajectoryLogger("test-run-123", tempDir);
  });

  afterEach(async () => {
    try {
      await Bun.$`rm -rf ${join(tempDir, "..")}`.quiet();
    } catch {
      // ignore cleanup errors
    }
  });

  test("creates logger with correct file path", () => {
    const filePath = logger.getFilePath();

    expect(filePath).toContain("test-run-123");
    expect(filePath).toContain("run_test-run-123.jsonl");
  });

  test("logs single entry", async () => {
    await logger.log({
      timestamp: 1000,
      type: "system_prompt",
      content: "Test prompt",
    });

    const entries = logger.getEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe("system_prompt");
    expect(entries[0]!.content).toBe("Test prompt");
  });

  test("logs multiple entries", async () => {
    await logger.log({ timestamp: 1000, type: "system_prompt", content: "System" });
    await logger.log({ timestamp: 2000, type: "user_instructions", content: "Instructions" });
    await logger.log({ timestamp: 3000, type: "assistant_message", content: { text: "Response" } });

    const entries = logger.getEntries();

    expect(entries).toHaveLength(3);
    expect(entries[0]!.type).toBe("system_prompt");
    expect(entries[1]!.type).toBe("user_instructions");
    expect(entries[2]!.type).toBe("assistant_message");
  });

  test("persists entries to file on finalize", async () => {
    await logger.log({ timestamp: 1000, type: "system_prompt", content: "Test" });
    await logger.log({ timestamp: 2000, type: "user_instructions", content: "Do something" });

    const filePath = await logger.finalize();

    const file = Bun.file(filePath);
    expect(await file.exists()).toBe(true);

    const content = await file.text();
    const lines = content.trim().split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).type).toBe("system_prompt");
    expect(JSON.parse(lines[1]!).type).toBe("user_instructions");
  });

  test("throws when logging after finalization", async () => {
    await logger.log({ timestamp: 1000, type: "system_prompt", content: "Test" });
    await logger.finalize();

    expect(async () => {
      await logger.log({ timestamp: 2000, type: "error", content: "Too late" });
    }).toThrow();
  });

  test("finalized logger returns same path on repeated calls", async () => {
    await logger.log({ timestamp: 1000, type: "system_prompt", content: "Test" });

    const path1 = await logger.finalize();
    const path2 = await logger.finalize();

    expect(path1).toBe(path2);
    expect(logger.isFinalized()).toBe(true);
  });

  test("logSync adds entry without persisting", async () => {
    logger.logSync({ timestamp: 1000, type: "system_prompt", content: "Sync test" });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);

    const filePath = logger.getFilePath();
    const file = Bun.file(filePath);
    expect(await file.exists()).toBe(false);
  });

  test("creates directory if it does not exist", async () => {
    const newDir = join(tempDir, "nested", "deep", "path");
    const nestedLogger = new TrajectoryLogger("nested-run", newDir);

    await nestedLogger.log({ timestamp: 1000, type: "system_prompt", content: "Test" });
    await nestedLogger.finalize();

    const filePath = nestedLogger.getFilePath();
    const file = Bun.file(filePath);
    expect(await file.exists()).toBe(true);
  });
});

describe("readTrajectory", () => {
  let tempFile: string;

  beforeEach(async () => {
    const tempPath = await Bun.$`mktemp`.text().then((s) => s.trim());
    tempFile = tempPath;

    const entries = [
      { timestamp: 1000, type: "system_prompt", content: "System" },
      { timestamp: 2000, type: "user_instructions", content: "User" },
      { timestamp: 3000, type: "assistant_message", content: { text: "Assistant" } },
    ];

    const lines = entries.map((e) => JSON.stringify(e)).join("\n");
    await Bun.write(tempFile, lines + "\n");
  });

  afterEach(async () => {
    try {
      await Bun.$`rm -f ${tempFile}`.quiet();
    } catch {
      // ignore cleanup errors
    }
  });

  test("reads trajectory file correctly", async () => {
    const entries = await readTrajectory(tempFile);

    expect(entries).toHaveLength(3);
    expect(entries[0]!.type).toBe("system_prompt");
    expect(entries[1]!.type).toBe("user_instructions");
    expect(entries[2]!.type).toBe("assistant_message");
  });

  test("throws for non-existent file", async () => {
    expect(async () => {
      await readTrajectory("/nonexistent/path/file.jsonl");
    }).toThrow();
  });
});
