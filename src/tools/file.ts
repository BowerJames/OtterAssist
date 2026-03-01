import { join, dirname } from "node:path";
import { mkdir, stat as fsStat, readdir } from "node:fs/promises";
import type { Tool, ToolResult } from "./types";
import { getWorkspacePath, validateWorkspacePath } from "./env";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const DEFAULT_ENCODING = "utf-8";

function isBinaryData(data: Uint8Array): boolean {
  const sampleSize = Math.min(data.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    if (data[i] === 0) {
      return true;
    }
  }
  return false;
}

export const readFileTool: Tool = {
  name: "read_file",
  description:
    "Read file contents from the workspace. Supports text files with optional encoding. Binary files are rejected.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file within the workspace",
      },
      encoding: {
        type: "string",
        description: "Text encoding to use (default: utf-8)",
        default: DEFAULT_ENCODING,
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (1-indexed, optional)",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read (optional)",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const relativePath = args.path as string;
    const encoding = (args.encoding as string) ?? DEFAULT_ENCODING;
    const offset = args.offset as number | undefined;
    const limit = args.limit as number | undefined;

    let resolvedPath: string;
    try {
      resolvedPath = validateWorkspacePath(relativePath);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid path",
      };
    }

    try {
      let stat;
      try {
        stat = await fsStat(resolvedPath);
      } catch {
        return {
          success: false,
          error: `File not found: ${relativePath}`,
        };
      }

      if (stat.isDirectory()) {
        return {
          success: false,
          error: `Path is a directory, not a file: ${relativePath}. Use list_files to read directories.`,
        };
      }

      const file = Bun.file(resolvedPath);

      if (stat.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `File too large: ${relativePath} (${stat.size} bytes exceeds ${MAX_FILE_SIZE} byte limit)`,
          truncated: true,
        };
      }

      const content = await file.arrayBuffer();
      const bytes = new Uint8Array(content);

      if (isBinaryData(bytes)) {
        return {
          success: false,
          error: `Binary file detected: ${relativePath}. This tool only supports text files.`,
        };
      }

      let text = new TextDecoder().decode(bytes);

      if (offset !== undefined || limit !== undefined) {
        const lines = text.split("\n");
        const startLine = Math.max(1, offset ?? 1) - 1;
        const lineCount = limit ?? lines.length;
        const selectedLines = lines.slice(startLine, startLine + lineCount);

        text = selectedLines
          .map((line, idx) => `${startLine + idx + 1}: ${line}`)
          .join("\n");
      }

      return {
        success: true,
        output: text,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error reading file",
      };
    }
  },
};

export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Write content to a file in the workspace. Creates parent directories if they don't exist.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file within the workspace",
      },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
      encoding: {
        type: "string",
        description: "Text encoding to use (default: utf-8)",
        default: DEFAULT_ENCODING,
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const relativePath = args.path as string;
    const content = args.content as string;
    const encoding = (args.encoding as string) ?? DEFAULT_ENCODING;

    let resolvedPath: string;
    try {
      resolvedPath = validateWorkspacePath(relativePath);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid path",
      };
    }

    try {
      const parentDir = dirname(resolvedPath);
      await mkdir(parentDir, { recursive: true });

      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);

      await Bun.write(resolvedPath, bytes);

      return {
        success: true,
        output: `Wrote ${bytes.length} bytes to ${relativePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error writing file",
      };
    }
  },
};

export const listFilesTool: Tool = {
  name: "list_files",
  description:
    "List directory contents in the workspace. Returns entries with type indicators ([DIR] or [FILE]).",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the directory within the workspace (default: workspace root)",
        default: ".",
      },
      recursive: {
        type: "boolean",
        description: "List files recursively (default: false)",
        default: false,
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const relativePath = (args.path as string) ?? ".";
    const recursive = (args.recursive as boolean) ?? false;

    let resolvedPath: string;
    try {
      resolvedPath = validateWorkspacePath(relativePath);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid path",
      };
    }

    try {
      let stat;
      try {
        stat = await fsStat(resolvedPath);
      } catch {
        return {
          success: false,
          error: `Cannot access path: ${relativePath}`,
        };
      }

      if (!stat.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${relativePath}. Use read_file to read files.`,
        };
      }

      const entries: string[] = [];

      if (recursive) {
        const scanDir = async (dir: string, prefix: string) => {
          const dirents = await readdir(dir, { withFileTypes: true });
          for (const dirent of dirents) {
            const entryPath = prefix ? `${prefix}/${dirent.name}` : dirent.name;
            if (dirent.isDirectory()) {
              entries.push(`[DIR]  ${entryPath}/`);
              await scanDir(join(dir, dirent.name), entryPath);
            } else {
              entries.push(`[FILE] ${entryPath}`);
            }
          }
        };
        await scanDir(resolvedPath, "");
      } else {
        const dirents = await readdir(resolvedPath, { withFileTypes: true });
        for (const dirent of dirents) {
          if (dirent.isDirectory()) {
            entries.push(`[DIR]  ${dirent.name}/`);
          } else {
            entries.push(`[FILE] ${dirent.name}`);
          }
        }
      }

      if (entries.length === 0) {
        return {
          success: true,
          output: "(empty directory)",
        };
      }

      entries.sort();

      return {
        success: true,
        output: entries.join("\n"),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error listing directory",
      };
    }
  },
};
