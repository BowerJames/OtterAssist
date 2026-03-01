import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { readFileTool, writeFileTool, listFilesTool } from "../file";
import { mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("file tools", () => {
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

  describe("read_file", () => {
    test("reads existing file", async () => {
      await writeFile(join(tempWorkspace, "test.txt"), "Hello, world!");
      const result = await readFileTool.execute({ path: "test.txt" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello, world!");
    });

    test("reads file in subdirectory", async () => {
      await mkdir(join(tempWorkspace, "subdir"), { recursive: true });
      await writeFile(join(tempWorkspace, "subdir/nested.txt"), "nested content");
      const result = await readFileTool.execute({ path: "subdir/nested.txt" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("nested content");
    });

    test("fails for non-existent file", async () => {
      const result = await readFileTool.execute({ path: "nonexistent.txt" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    test("fails for directory path", async () => {
      await mkdir(join(tempWorkspace, "mydir"));
      const result = await readFileTool.execute({ path: "mydir" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path is a directory");
    });

    test("fails for path traversal", async () => {
      const result = await readFileTool.execute({ path: "../../../etc/passwd" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal detected");
    });

    test("rejects binary files", async () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 0, 5, 6]);
      await writeFile(join(tempWorkspace, "binary.bin"), binaryData);
      const result = await readFileTool.execute({ path: "binary.bin" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Binary file detected");
    });

    test("allows text files with unicode", async () => {
      await writeFile(join(tempWorkspace, "unicode.txt"), "Hello 你好 🎉");
      const result = await readFileTool.execute({ path: "unicode.txt" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("你好");
    });

    test("supports offset for pagination", async () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      await writeFile(join(tempWorkspace, "multi.txt"), content);
      const result = await readFileTool.execute({ path: "multi.txt", offset: 2, limit: 2 });
      expect(result.success).toBe(true);
      expect(result.output).toContain("2: line2");
      expect(result.output).toContain("3: line3");
      expect(result.output).not.toContain("line1");
      expect(result.output).not.toContain("line4");
    });

    test("supports limit only", async () => {
      const content = "line1\nline2\nline3";
      await writeFile(join(tempWorkspace, "limit.txt"), content);
      const result = await readFileTool.execute({ path: "limit.txt", limit: 2 });
      expect(result.success).toBe(true);
      expect(result.output).toContain("1: line1");
      expect(result.output).toContain("2: line2");
      expect(result.output).not.toContain("line3");
    });
  });

  describe("write_file", () => {
    test("writes content to new file", async () => {
      const result = await writeFileTool.execute({
        path: "new.txt",
        content: "New content",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Wrote");

      const readResult = await readFileTool.execute({ path: "new.txt" });
      expect(readResult.output).toBe("New content");
    });

    test("overwrites existing file", async () => {
      await writeFile(join(tempWorkspace, "existing.txt"), "Old content");
      const result = await writeFileTool.execute({
        path: "existing.txt",
        content: "New content",
      });
      expect(result.success).toBe(true);

      const readResult = await readFileTool.execute({ path: "existing.txt" });
      expect(readResult.output).toBe("New content");
    });

    test("creates parent directories", async () => {
      const result = await writeFileTool.execute({
        path: "deeply/nested/dir/file.txt",
        content: "Nested content",
      });
      expect(result.success).toBe(true);

      const readResult = await readFileTool.execute({ path: "deeply/nested/dir/file.txt" });
      expect(readResult.output).toBe("Nested content");
    });

    test("fails for path traversal", async () => {
      const result = await writeFileTool.execute({
        path: "../../../tmp/evil.txt",
        content: "evil",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal detected");
    });

    test("writes unicode content", async () => {
      const result = await writeFileTool.execute({
        path: "unicode.txt",
        content: "Hello 你好 🎉",
      });
      expect(result.success).toBe(true);

      const readResult = await readFileTool.execute({ path: "unicode.txt" });
      expect(readResult.output).toBe("Hello 你好 🎉");
    });

    test("writes empty file", async () => {
      const result = await writeFileTool.execute({
        path: "empty.txt",
        content: "",
      });
      expect(result.success).toBe(true);

      const readResult = await readFileTool.execute({ path: "empty.txt" });
      expect(readResult.output).toBe("");
    });
  });

  describe("list_files", () => {
    test("lists empty directory", async () => {
      const result = await listFilesTool.execute({ path: "." });
      expect(result.success).toBe(true);
      expect(result.output).toBe("(empty directory)");
    });

    test("lists files and directories", async () => {
      await writeFile(join(tempWorkspace, "file1.txt"), "content");
      await writeFile(join(tempWorkspace, "file2.txt"), "content");
      await mkdir(join(tempWorkspace, "subdir"));

      const result = await listFilesTool.execute({ path: "." });
      expect(result.success).toBe(true);
      expect(result.output).toContain("[FILE] file1.txt");
      expect(result.output).toContain("[FILE] file2.txt");
      expect(result.output).toContain("[DIR]  subdir/");
    });

    test("lists non-recursively by default", async () => {
      await mkdir(join(tempWorkspace, "subdir"));
      await writeFile(join(tempWorkspace, "root.txt"), "content");
      await writeFile(join(tempWorkspace, "subdir/nested.txt"), "content");

      const result = await listFilesTool.execute({ path: "." });
      expect(result.success).toBe(true);
      expect(result.output).toContain("[FILE] root.txt");
      expect(result.output).toContain("[DIR]  subdir/");
      expect(result.output).not.toContain("nested.txt");
    });

    test("lists recursively when requested", async () => {
      await mkdir(join(tempWorkspace, "subdir"), { recursive: true });
      await writeFile(join(tempWorkspace, "root.txt"), "content");
      await writeFile(join(tempWorkspace, "subdir/nested.txt"), "content");

      const result = await listFilesTool.execute({ path: ".", recursive: true });
      expect(result.success).toBe(true);
      expect(result.output).toContain("[FILE] root.txt");
      expect(result.output).toContain("[FILE] subdir/nested.txt");
    });

    test("lists nested directories recursively", async () => {
      await mkdir(join(tempWorkspace, "a/b/c"), { recursive: true });
      await writeFile(join(tempWorkspace, "a/file1.txt"), "content");
      await writeFile(join(tempWorkspace, "a/b/file2.txt"), "content");
      await writeFile(join(tempWorkspace, "a/b/c/file3.txt"), "content");

      const result = await listFilesTool.execute({ path: ".", recursive: true });
      expect(result.success).toBe(true);
      expect(result.output).toContain("[FILE] a/file1.txt");
      expect(result.output).toContain("[FILE] a/b/file2.txt");
      expect(result.output).toContain("[FILE] a/b/c/file3.txt");
    });

    test("lists subdirectory contents", async () => {
      await mkdir(join(tempWorkspace, "subdir"));
      await writeFile(join(tempWorkspace, "subdir/file.txt"), "content");

      const result = await listFilesTool.execute({ path: "subdir" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("[FILE] file.txt");
    });

    test("fails for non-existent directory", async () => {
      const result = await listFilesTool.execute({ path: "nonexistent" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot access path");
    });

    test("fails for file path", async () => {
      await writeFile(join(tempWorkspace, "file.txt"), "content");
      const result = await listFilesTool.execute({ path: "file.txt" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path is not a directory");
    });

    test("fails for path traversal", async () => {
      const result = await listFilesTool.execute({ path: "../../../etc" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Path traversal detected");
    });

    test("defaults to workspace root", async () => {
      await writeFile(join(tempWorkspace, "root.txt"), "content");

      const result = await listFilesTool.execute({});
      expect(result.success).toBe(true);
      expect(result.output).toContain("[FILE] root.txt");
    });
  });
});
