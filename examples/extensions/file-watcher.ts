/**
 * File Watcher Extension
 *
 * Watches a directory for new files and creates processing events.
 * Demonstrates combining event sources with a skill for the agent.
 *
 * Features:
 * - Watch a configurable directory for new files
 * - Filter by file patterns (e.g., *.pdf, *.png)
 * - Provides a skill that teaches the agent how to process different file types
 * - Provides a tool to check watcher status
 */

import { watch, type FSWatcher } from "node:fs";
import { extname, join } from "node:path";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { OtterAssistExtension, OAExtensionContext } from "otterassist";

interface FileWatcherConfig {
  /** Directory to watch (default: ~/Downloads) */
  watchPath?: string;
  /** File patterns to match (e.g., ["*.pdf", "*.png"]) */
  patterns?: string[];
  /** Include hidden files (default: false) */
  includeHidden?: boolean;
}

interface PendingFile {
  name: string;
  path: string;
  size: number;
  addedAt: Date;
}

let watcher: FSWatcher | null = null;
let pendingFiles: PendingFile[] = [];
let config: Required<FileWatcherConfig>;
let watchPath: string;
let contextLogger: OAExtensionContext["logger"];

/**
 * Expand ~ to home directory
 */
function expandHomeDir(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Check if a filename matches any of the patterns
 */
function matchesPatterns(filename: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;

  const ext = extname(filename).toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith("*.")) {
      return ext === pattern.slice(1).toLowerCase();
    }
    return filename.toLowerCase().includes(pattern.toLowerCase());
  });
}

/**
 * Check if a file is hidden (starts with .)
 */
function isHidden(filename: string): boolean {
  return filename.startsWith(".");
}

/**
 * Get human-readable file size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default {
  name: "file-watcher",
  description: "Watch a directory for new files and create processing events",
  version: "1.0.0",

  events: {
    async initialize(cfg: FileWatcherConfig, context: OAExtensionContext) {
      // Store config with defaults
      config = {
        watchPath: cfg.watchPath ?? "~/Downloads",
        patterns: cfg.patterns ?? [],
        includeHidden: cfg.includeHidden ?? false,
      };

      contextLogger = context.logger;
      watchPath = expandHomeDir(config.watchPath);

      // Verify the directory exists
      try {
        await access(watchPath);
      } catch {
        throw new Error(`Watch path does not exist: ${watchPath}`);
      }

      context.logger.info(`Watching directory: ${watchPath}`);
      context.logger.debug(
        `Patterns: ${config.patterns.length > 0 ? config.patterns.join(", ") : "(all files)"}`,
      );

      // Start watching the directory
      try {
        watcher = watch(
          watchPath,
          { persistent: false },
          (eventType, filename) => {
            if (eventType === "rename" && filename) {
              handleFileEvent(filename);
            }
          },
        );

        watcher.on("error", (error) => {
          contextLogger.error(`File watcher error: ${error.message}`);
        });
      } catch (error) {
        context.logger.error(`Failed to start file watcher: ${error}`);
        throw error;
      }
    },

    async poll() {
      // Return and clear pending files
      const files = [...pendingFiles];
      pendingFiles = [];

      if (files.length === 0) {
        return [];
      }

      return files.map((file) => {
        const size = formatSize(file.size);
        const ext = extname(file.name).toLowerCase() || "unknown";

        return `📁 New file detected in ${watchPath}

File: ${file.name}
Path: ${file.path}
Size: ${size}
Type: ${ext}
Detected: ${file.addedAt.toLocaleString()}

Please process this file appropriately. Use the file-watcher skill for guidance on handling different file types.`;
      });
    },

    async shutdown() {
      if (watcher) {
        watcher.close();
        watcher = null;
        contextLogger?.info("File watcher stopped");
      }
    },
  },

  piExtension(pi: ExtensionAPI) {
    // Register a skill that teaches the agent how to process files
    pi.registerSkill?.({
      name: "file-watcher",
      description:
        "Guidance for processing files detected in the watched directory",
      content: `# File Processing Guide

This skill guides you through processing files detected by the file-watcher extension.

## Watched Directory

The file-watcher monitors a directory for new files. Check the current watch path using the \`file_watcher_status\` tool.

## File Type Handling

### PDF Files (.pdf)
1. Extract text content:
   \`\`\`bash
   pdftotext "$FILE" -  # Extract text to stdout
   pdfinfo "$FILE"      # Get metadata
   \`\`\`
2. Summarize the content
3. Route to appropriate folder based on content

### Images (.png, .jpg, .jpeg, .gif, .webp)
1. The \`read\` tool can view images
2. Describe the image contents
3. Extract text from screenshots or documents if applicable
4. Route to appropriate folder

### Code Files (.js, .ts, .py, .go, etc.)
1. Use \`read\` to examine the code
2. Analyze for quality, security issues, or improvements
3. If it's a snippet, suggest where it belongs

### Data Files (.json, .csv, .yaml, .xml)
1. Use \`read\` to examine contents
2. Validate structure
3. Summarize the data
4. Suggest processing or storage location

### Archives (.zip, .tar, .gz)
1. List contents: \`unzip -l "$FILE"\` or \`tar -tvf "$FILE"\`
2. Extract if needed
3. Report contents summary

### Documents (.md, .txt, .docx)
1. Read and summarize
2. Extract key information
3. Organize appropriately

## Common Actions

### Move File
\`\`\`bash
mv "$SOURCE" "$DESTINATION"
\`\`\`

### Delete File
\`\`\`bash
rm "$FILE"
\`\`\`

### Create Directory
\`\`\`bash
mkdir -p "$DIRECTORY"
\`\`\`

## Guidelines

- Always check file contents before deciding what to do
- Be cautious with executable files
- For sensitive files, ask for confirmation before deleting
- Organize files into logical folders
- Provide a summary of actions taken`,
    });

    // Register a tool to check watcher status
    pi.registerTool({
      name: "file_watcher_status",
      label: "File Watcher Status",
      description:
        "Get the current status of the file watcher including watch path and pending files",
      parameters: Type.Object({}),
      async execute() {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  watchPath,
                  pendingCount: pendingFiles.length,
                  patterns: config.patterns.length > 0 ? config.patterns : ["*"],
                  includeHidden: config.includeHidden,
                },
                null,
                2,
              ),
            },
          ],
          details: { watchPath, pendingFiles: pendingFiles.map(f => f.name) },
        };
      },
    });
  },
} satisfies OtterAssistExtension;

/**
 * Handle a file system event
 */
function handleFileEvent(filename: string): void {
  // Skip hidden files unless configured to include them
  if (!config.includeHidden && isHidden(filename)) {
    return;
  }

  // Check pattern match
  if (config.patterns.length > 0 && !matchesPatterns(filename, config.patterns)) {
    return;
  }

  // Get file info
  const fullPath = join(watchPath, filename);

  stat(fullPath)
    .then((stats) => {
      if (stats.isFile()) {
        pendingFiles.push({
          name: filename,
          path: fullPath,
          size: stats.size,
          addedAt: new Date(),
        });
        contextLogger?.debug(`New file detected: ${filename}`);
      }
    })
    .catch(() => {
      // File might have been deleted already, ignore
    });
}

/**
 * Configuration example (~/.otterassist/config.json):
 *
 * {
 *   "extensions": {
 *     "file-watcher": {
 *       "enabled": true,
 *       "config": {
 *         "watchPath": "~/Downloads",
 *         "patterns": ["*.pdf", "*.png", "*.jpg"],
 *         "includeHidden": false
 *       }
 *     }
 *   }
 * }
 */
