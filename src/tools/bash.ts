import { resolve } from "node:path";
import type { Tool, ToolResult } from "./types";
import { getWorkspacePath, isPathWithinWorkspace } from "./env";

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT_SIZE = 100 * 1024; // 100KB

const DANGEROUS_PATTERNS = [
  /\bsudo\b/,
  /\bsu\b(?!\bd)/,
  /\brm\s+(-[rf]+\s+)?\//,
  />\s*\/dev\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bchmod\s+777\b/,
  /\bchown\b.*\broot\b/,
  />\s*\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\binit\s+[06]/,
  /\bpasswd\b/,
  /\buseradd\b/,
  /\buserdel\b/,
  /\busermod\b/,
];

function containsDangerousPattern(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Command blocked: matches dangerous pattern "${pattern.source}"`;
    }
  }
  return null;
}

function isBinaryData(data: Uint8Array): boolean {
  const sampleSize = Math.min(data.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    const byte = data[i];
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

async function readWithLimit(
  stream: ReadableStream<Uint8Array>,
  maxSize: number,
  signal?: AbortSignal
): Promise<{ data: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  let truncated = false;

  const reader = stream.getReader();

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      if (!truncated) {
        chunks.push(value);
        totalSize += value.length;

        if (totalSize > maxSize) {
          truncated = true;
        }
      }
    }
  } catch {
    // Stream may be interrupted on timeout
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(Math.min(totalSize, maxSize));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = combined.length - offset;
    if (remaining <= 0) break;
    const toCopy = Math.min(chunk.length, remaining);
    combined.set(chunk.subarray(0, toCopy), offset);
    offset += toCopy;
  }

  return { data: combined, truncated };
}

export const bashTool: Tool = {
  name: "bash",
  description:
    "Execute a shell command within the workspace directory. Commands are scoped to the workspace and subject to security restrictions.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
        default: DEFAULT_TIMEOUT_MS,
      },
      cwd: {
        type: "string",
        description:
          "Working directory relative to workspace root (optional)",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const command = args.command as string;
    const timeout = (args.timeout as number) ?? DEFAULT_TIMEOUT_MS;
    const cwdRelative = args.cwd as string | undefined;

    const dangerCheck = containsDangerousPattern(command);
    if (dangerCheck) {
      return {
        success: false,
        error: dangerCheck,
      };
    }

    const workspaceRoot = getWorkspacePath();
    let cwd: string;

    if (cwdRelative) {
      const resolved = resolve(workspaceRoot, cwdRelative);
      if (!isPathWithinWorkspace(resolved)) {
        return {
          success: false,
          error: `Path traversal detected: "${cwdRelative}" escapes workspace`,
        };
      }
      cwd = resolved;
    } else {
      cwd = workspaceRoot;
    }

    const abortController = new AbortController();
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd,
      stdin: null,
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        abortController.abort();
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      const [stdoutResult, stderrResult] = await Promise.race([
        Promise.all([
          readWithLimit(proc.stdout as ReadableStream<Uint8Array>, MAX_OUTPUT_SIZE / 2, abortController.signal),
          readWithLimit(proc.stderr as ReadableStream<Uint8Array>, MAX_OUTPUT_SIZE / 2, abortController.signal),
        ]),
        timeoutPromise,
      ]);

      const combined = new Uint8Array(stdoutResult.data.length + stderrResult.data.length);
      combined.set(stdoutResult.data, 0);
      combined.set(stderrResult.data, stdoutResult.data.length);

      const truncated = stdoutResult.truncated || stderrResult.truncated;
      const isBinary = isBinaryData(combined);

      const exitCode = await proc.exited;

      if (isBinary) {
        return {
          success: false,
          exitCode,
          error: "Binary output detected. This tool does not support binary data. Try using 'file' command to inspect file type, or redirect output to a file.",
        };
      }

      const output = new TextDecoder("utf-8", { fatal: false }).decode(combined);

      return {
        success: exitCode === 0,
        output,
        exitCode,
        truncated,
      };
    } catch (error) {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};
