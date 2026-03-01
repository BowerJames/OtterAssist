import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { getOtterAssistHome, getWorkspacePath, isPathWithinWorkspace, validateWorkspacePath } from "../env";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("env helpers", () => {
  const originalEnv = process.env.OTTER_ASSIST_HOME;

  beforeEach(() => {
    delete process.env.OTTER_ASSIST_HOME;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OTTER_ASSIST_HOME = originalEnv;
    } else {
      delete process.env.OTTER_ASSIST_HOME;
    }
  });

  describe("getOtterAssistHome", () => {
    test("returns default path when env not set", () => {
      const home = getOtterAssistHome();
      expect(home).toContain(".otter_assist");
    });

    test("returns env path when OTTER_ASSIST_HOME is set", () => {
      process.env.OTTER_ASSIST_HOME = "/custom/path";
      const home = getOtterAssistHome();
      expect(home).toBe("/custom/path");
    });

    test("resolves relative paths", () => {
      process.env.OTTER_ASSIST_HOME = "./relative";
      const home = getOtterAssistHome();
      expect(home).toBe(resolve("./relative"));
    });
  });

  describe("getWorkspacePath", () => {
    test("returns workspace path without subpath", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      const path = getWorkspacePath();
      expect(path).toBe("/test/home/workspace");
    });

    test("returns workspace path with subpath", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      const path = getWorkspacePath("subdir/file.txt");
      expect(path).toBe("/test/home/workspace/subdir/file.txt");
    });

    test("normalizes subpath", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      const path = getWorkspacePath("./subdir/../other");
      expect(path).toBe("/test/home/workspace/other");
    });
  });

  describe("isPathWithinWorkspace", () => {
    test("returns true for workspace itself", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      expect(isPathWithinWorkspace("/test/home/workspace")).toBe(true);
    });

    test("returns true for path inside workspace", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      expect(isPathWithinWorkspace("/test/home/workspace/subdir/file.txt")).toBe(true);
    });

    test("returns false for path outside workspace", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      expect(isPathWithinWorkspace("/etc/passwd")).toBe(false);
    });

    test("returns false for path starting with workspace name but not actually inside", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      expect(isPathWithinWorkspace("/test/home/workspace-other")).toBe(false);
    });
  });

  describe("validateWorkspacePath", () => {
    test("returns valid resolved path", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      const path = validateWorkspacePath("subdir/file.txt");
      expect(path).toBe("/test/home/workspace/subdir/file.txt");
    });

    test("throws on path traversal with ..", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      expect(() => validateWorkspacePath("../../../etc")).toThrow("Path traversal detected");
    });

    test("throws on path traversal to parent", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      expect(() => validateWorkspacePath("..")).toThrow("Path traversal detected");
    });

    test("allows deep nesting within workspace", () => {
      process.env.OTTER_ASSIST_HOME = "/test/home";
      const path = validateWorkspacePath("a/b/c/d/e/f");
      expect(path).toBe("/test/home/workspace/a/b/c/d/e/f");
    });
  });
});
