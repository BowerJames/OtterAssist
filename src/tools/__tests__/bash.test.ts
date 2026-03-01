import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { bashTool } from "../bash";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("bashTool", () => {
  let tempHome: string;
  let tempWorkspace: string;
  const originalEnv = process.env.OTTER_ASSIST_HOME;

  beforeEach(async () => {
    tempHome = join(tmpdir(), `otter-test-${Date.now()}`);
    tempWorkspace = join(tempHome, "workspace");
    await mkdir(tempWorkspace, { recursive: true });
    process.env.OTTER_ASSIST_HOME = tempHome;
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env.OTTER_ASSIST_HOME = originalEnv;
    } else {
      delete process.env.OTTER_ASSIST_HOME;
    }
    await rm(tempHome, { recursive: true, force: true });
  });

  describe("basic execution", () => {
    test("executes simple command", async () => {
      const result = await bashTool.execute({ command: "echo hello" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("hello");
      expect(result.exitCode).toBe(0);
    });

    test("returns non-zero exit code", async () => {
      const result = await bashTool.execute({ command: "exit 42" });
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(42);
    });

    test("captures stderr", async () => {
      const result = await bashTool.execute({ command: "echo error >&2" });
      expect(result.output).toContain("error");
    });

    test("captures combined stdout and stderr", async () => {
      const result = await bashTool.execute({
        command: "echo stdout && echo stderr >&2",
      });
      expect(result.output).toContain("stdout");
      expect(result.output).toContain("stderr");
    });
  });

  describe("working directory", () => {
    test("runs in workspace by default", async () => {
      const result = await bashTool.execute({ command: "pwd" });
      expect(result.output?.trim()).toBe(tempWorkspace);
    });

    test("respects cwd parameter", async () => {
      const subdir = join(tempWorkspace, "subdir");
      await mkdir(subdir);
      const result = await bashTool.execute({ command: "pwd", cwd: "subdir" });
      expect(result.output?.trim()).toBe(subdir);
    });

    test("creates nested directories with relative path", async () => {
      await mkdir(join(tempWorkspace, "a/b"), { recursive: true });
      const result = await bashTool.execute({ command: "pwd", cwd: "a/b" });
      expect(result.output?.trim()).toBe(join(tempWorkspace, "a/b"));
    });
  });

  describe("path security", () => {
    test("blocks path traversal with ..", async () => {
      const result = await bashTool.execute({
        command: "pwd",
        cwd: "../../../etc",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal detected");
    });

    test("blocks absolute path outside workspace", async () => {
      const result = await bashTool.execute({
        command: "pwd",
        cwd: "/etc",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal detected");
    });
  });

  describe("timeout", () => {
    test("kills long-running command after timeout", async () => {
      const result = await bashTool.execute({
        command: "sleep 10",
        timeout: 100,
      });
      expect(result.success).toBe(false);
    });

    test("completes quick command before timeout", async () => {
      const result = await bashTool.execute({
        command: "echo quick",
        timeout: 5000,
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("quick");
    });
  });

  describe("output handling", () => {
    test("truncates large output", async () => {
      const result = await bashTool.execute({
        command: "yes | head -c 200000",
        timeout: 5000,
      });
      expect(result.truncated).toBe(true);
      expect(result.output!.length).toBeLessThanOrEqual(100 * 1024);
    });

    test("indicates when output is not truncated", async () => {
      const result = await bashTool.execute({ command: "echo small" });
      expect(result.truncated).toBe(false);
    });
  });

  describe("binary output detection", () => {
    test("rejects binary output", async () => {
      const binaryFile = join(tempWorkspace, "test.bin");
      const binaryData = new Uint8Array([0, 1, 2, 3, 0, 5, 6]);
      await writeFile(binaryFile, binaryData);

      const result = await bashTool.execute({ command: "cat test.bin" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Binary output detected");
    });

    test("allows text files with high bytes", async () => {
      const textFile = join(tempWorkspace, "test.txt");
      await writeFile(textFile, "Hello, world! 你好");

      const result = await bashTool.execute({ command: "cat test.txt" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Hello");
    });
  });

  describe("dangerous command blocklist", () => {
    test("blocks sudo", async () => {
      const result = await bashTool.execute({ command: "sudo ls" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Command blocked");
    });

    test("blocks rm -rf /", async () => {
      const result = await bashTool.execute({ command: "rm -rf /" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Command blocked");
    });

    test("blocks rm with slash", async () => {
      const result = await bashTool.execute({ command: "rm /etc/passwd" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Command blocked");
    });

    test("blocks dd if=", async () => {
      const result = await bashTool.execute({ command: "dd if=/dev/zero" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Command blocked");
    });

    test("blocks redirect to /dev/", async () => {
      const result = await bashTool.execute({ command: "echo test > /dev/sda" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Command blocked");
    });

    test("blocks shutdown", async () => {
      const result = await bashTool.execute({ command: "shutdown now" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Command blocked");
    });

    test("blocks reboot", async () => {
      const result = await bashTool.execute({ command: "reboot" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Command blocked");
    });

    test("allows safe rm within workspace", async () => {
      const file = join(tempWorkspace, "to-delete.txt");
      await writeFile(file, "test");
      const result = await bashTool.execute({ command: "rm to-delete.txt" });
      expect(result.success).toBe(true);
    });

    test("allows chmod non-777", async () => {
      const file = join(tempWorkspace, "test.txt");
      await writeFile(file, "test");
      const result = await bashTool.execute({ command: "chmod 644 test.txt" });
      expect(result.success).toBe(true);
    });
  });
});
