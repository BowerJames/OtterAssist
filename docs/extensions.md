# Extension Development

Extensions are self-contained modules that extend OtterAssist with new capabilities. An extension can:

- **Produce events** - Poll for new items and create events for the agent to process
- **Provide tools** - Add LLM-callable tools the agent can use
- **Register skills** - Add instruction packages that teach the agent how to handle specific tasks
- **Hook into events** - React to agent lifecycle events (tool calls, messages, etc.)

## Table of Contents

- [Installing Extensions](#installing-extensions)
- [Quick Start](#quick-start)
- [Extension Locations](#extension-locations)
- [Extension Interface](#extension-interface)
- [Event Sources](#event-sources)
- [Pi Extensions](#pi-extensions)
- [Examples](#examples)
- [Best Practices](#best-practices)
- [Debugging](#debugging)

## Installing Extensions

OtterAssist includes a built-in extension installer for managing extensions.

### Install from Local Path

```bash
# Install from a single file
otterassist install ./my-extension.ts

# Install from a directory
otterassist install ./my-extension/
```

When installing a single file, it's copied as `index.ts` into the extensions directory.

### Install from Git URL

```bash
# GitHub shorthand
otterassist install github:user/repo
otterassist install github:user/repo/tree/main/extensions/my-extension

# GitLab shorthand
otterassist install gitlab:user/repo

# Full git URL
otterassist install https://github.com/user/repo.git
```

For git URLs, the repository is cloned and the extension is copied to `~/.otterassist/extensions/`.

### Development Mode (Symlinks)

For extension development, use `--link` to create a symlink instead of copying:

```bash
otterassist install ./my-extension --link
```

This allows you to edit the extension files and have changes take effect immediately. The symlink points to your source directory.

### Install Options

| Option | Description |
|--------|-------------|
| `--link` | Create symlink instead of copy (for development) |
| `--force` | Overwrite existing extension |
| `--no-enable` | Don't auto-enable after install |

### Managing Extensions

```bash
# List installed extensions
otterassist extensions

# Show extension details
otterassist extensions show my-extension

# Enable an extension
otterassist enable my-extension

# Disable an extension
otterassist disable my-extension

# Uninstall an extension
otterassist uninstall my-extension
```

### Extension Package Structure

Extensions can be:

**Single file:**
```
my-extension.ts    # Exports OtterAssistExtension as default
```

**Full package:**
```
my-extension/
├── index.ts          # Required: exports OtterAssistExtension
├── package.json      # Optional: dependencies (bun install runs automatically)
├── otterassist.json  # Optional: metadata
└── README.md         # Optional: documentation
```

### Metadata File (otterassist.json)

Optional file for extension metadata:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "Your Name",
  "keywords": ["github", "issues"]
}
```

## Quick Start

Create a file at `~/.otterassist/extensions/my-extension.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OtterAssistExtension } from "otterassist";

export default {
  name: "my-extension",
  description: "My first OtterAssist extension",

  // Event source: poll for new items
  events: {
    async poll() {
      // Check for new items...
      return ["New item detected!"];
    }
  },

  // Pi extension: add capabilities to the agent
  piExtension(pi: ExtensionAPI) {
    pi.registerTool({
      name: "my_tool",
      label: "My Tool",
      description: "Does something useful",
      parameters: Type.Object({
        input: Type.String()
      }),
      async execute(id, params) {
        return {
          content: [{ type: "text", text: `Processed: ${params.input}` }]
        };
      }
    });
  }
} satisfies OtterAssistExtension;
```

Then install and enable it:

```bash
# Install the extension
otterassist install ~/.otterassist/extensions/my-extension.ts

# Or if you created it elsewhere
otterassist install ./my-extension.ts

# Enable it (happens automatically during install unless --no-enable is used)
otterassist enable my-extension
```

## Extension Locations

Extensions are discovered from two locations:

| Location | Purpose |
|----------|---------|
| `~/.otterassist/extensions/` | Global extensions (always available) |
| `./.otterassist/extensions/` | Project-local (overrides global) |

**File formats supported:**
- Single file: `~/.otterassist/extensions/my-extension.ts`
- Directory: `~/.otterassist/extensions/my-extension/index.ts`

Project-local extensions override global extensions with the same name.

## Extension Interface

```typescript
interface OtterAssistExtension {
  // Required
  name: string;           // Unique identifier (lowercase, hyphens allowed)
  description: string;    // Human-readable description

  // Optional
  version?: string;       // Version string (semver recommended)
  configSchema?: object;  // JSON Schema for configuration
  defaultConfig?: object; // Default configuration values

  // Event source (produces events for the queue)
  events?: EventSourceDefinition;

  // Pi extension (provides tools, skills, hooks)
  piExtension?: (pi: ExtensionAPI) => void;
}
```

### Minimum Requirements

An extension must have at least one of:
- `events` - To produce events
- `piExtension` - To add agent capabilities

An extension with neither will fail to load.

## Event Sources

Event sources poll for new items on a schedule and return messages that get added to the event queue.

### Interface

```typescript
interface EventSourceDefinition {
  /** Poll for new events. Returns messages for the queue. */
  poll(): Promise<string[]>;

  /** Called once when extension is loaded. */
  initialize?(config: unknown, context: OAExtensionContext): Promise<void>;

  /** Called once when OtterAssist shuts down. */
  shutdown?(): Promise<void>;
}

interface OAExtensionContext {
  configDir: string;  // ~/.otterassist/
  logger: Logger;     // Prefixed logger
}
```

### Example: File Watcher

```typescript
import { watch } from "node:fs/promises";
import { extname } from "node:path";
import type { OtterAssistExtension, OAExtensionContext } from "otterassist";

let watchPath: string;
let pendingFiles: string[] = [];

export default {
  name: "file-watcher",
  description: "Watch a directory for new files",

  events: {
    async initialize(config: { path: string; pattern?: string }, context) {
      watchPath = config.path ?? `${process.env.HOME}/Downloads`;
      context.logger.info(`Watching: ${watchPath}`);

      // Start watching in background
      const watcher = watch(watchPath);
      (async () => {
        for await (const event of watcher) {
          if (event.eventType === "rename" && event.filename) {
            pendingFiles.push(event.filename);
          }
        }
      })();
    },

    async poll() {
      const files = [...pendingFiles];
      pendingFiles = [];

      return files.map(file => 
        `New file detected in ${watchPath}: ${file}\n\nPlease process this file appropriately.`
      );
    }
  }
} satisfies OtterAssistExtension;
```

### Event Message Guidelines

Events become user messages to the agent. Write them as if you're telling a person what happened:

1. **Be specific** - Include all relevant details
2. **Provide context** - Explain what the event is and where it came from
3. **Give direction** - Tell the agent what to do (e.g., "respond appropriately")
4. **Reference skills** - Mention relevant skills if available

**Good:**
```
You have a new message in your inbox (ID: 42).

From: alice@example.com
Subject: Question about pricing

Content:
Hi, I'm interested in your enterprise plan. Can you provide pricing details?

Please handle this message and respond appropriately. Use the messaging skill for connection details.
```

**Poor:**
```
New message
```

## Pi Extensions

Pi extensions provide capabilities to the embedded agent. They use the same API as pi extensions.

### Tools

Register tools the LLM can call:

```typescript
piExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "send_email",
    label: "Send Email",
    description: "Send an email to a recipient",
    parameters: Type.Object({
      to: Type.String({ description: "Recipient email address" }),
      subject: Type.String({ description: "Email subject" }),
      body: Type.String({ description: "Email body" })
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // Send the email...
      
      return {
        content: [{ type: "text", text: `Email sent to ${params.to}` }],
        details: { messageId: "123" }
      };
    }
  });
}
```

### Skills

Skills are instruction packages that teach the agent how to handle specific tasks:

```typescript
piExtension(pi: ExtensionAPI) {
  pi.registerSkill?.({
    name: "messaging",
    description: "Connect to the messaging database and send/receive messages",
    content: `# Messaging System

## Connection
Database: PostgreSQL at messaging.internal:5432
Database name: inbox

## Reading Messages
\`\`\`bash
usql $MESSAGING_DB_URL -c "SELECT * FROM messages WHERE status = 'unread'"
\`\`\`

## Sending a Reply
\`\`\`bash
usql $MESSAGING_DB_URL -c "INSERT INTO outgoing (recipient, subject, body) VALUES (...)"
\`\`\`
`
  });
}
```

> **Note:** Skills require pi SDK support. Check if `registerSkill` is available before calling.

### Event Hooks

React to agent lifecycle events:

```typescript
piExtension(pi: ExtensionAPI) {
  // Log when the agent starts
  pi.on("agent_start", async (event, ctx) => {
    ctx.ui.notify("Agent started processing", "info");
  });

  // Intercept tool calls
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Track tool results
  pi.on("tool_result", async (event, ctx) => {
    console.log(`Tool ${event.toolName} completed`);
  });
}
```

Available events:
- `session_start` - Session loaded
- `agent_start` / `agent_end` - Per-prompt lifecycle
- `turn_start` / `turn_end` - Per-turn lifecycle
- `tool_call` / `tool_result` - Tool execution
- `message_start` / `message_update` / `message_end` - Message streaming
- And more - see [pi extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)

### Commands

Register slash commands:

```typescript
piExtension(pi: ExtensionAPI) {
  pi.registerCommand("mycommand", {
    description: "Do something custom",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Command executed with args: ${args}`, "info");
    }
  });
}
```

## Examples

### GitHub Issues Extension

Polls for new GitHub issues and provides tools to interact with them:

```typescript
import { Octokit } from "octokit";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { OtterAssistExtension } from "otterassist";

let octokit: Octokit;
let lastPoll: string;
let config: { owner: string; repo: string; token: string };

export default {
  name: "github",
  description: "GitHub integration: issue polling and management",
  version: "1.0.0",

  events: {
    async initialize(cfg, context) {
      config = cfg;
      octokit = new Octokit({ auth: config.token });
      lastPoll = new Date().toISOString();
      context.logger.info(`Watching repo: ${config.owner}/${config.repo}`);
    },

    async poll() {
      const issues = await octokit.rest.issues.listForRepo({
        owner: config.owner,
        repo: config.repo,
        state: "open",
        since: lastPoll
      });

      lastPoll = new Date().toISOString();

      return issues.data
        .filter(i => !i.pull_request)
        .map(issue => 
          `New GitHub issue: ${issue.title}\n\n` +
          `Repo: ${config.owner}/${config.repo}\n` +
          `Issue #${issue.number}\n` +
          `URL: ${issue.html_url}\n\n` +
          `${issue.body || "(no description)"}\n\n` +
          `Please triage this issue.`
        );
    }
  },

  piExtension(pi: ExtensionAPI) {
    pi.registerTool({
      name: "github_comment",
      label: "Add GitHub Comment",
      description: "Add a comment to a GitHub issue",
      parameters: Type.Object({
        issue_number: Type.Number(),
        comment: Type.String()
      }),
      async execute(id, params) {
        await octokit.rest.issues.createComment({
          owner: config.owner,
          repo: config.repo,
          issue_number: params.issue_number,
          body: params.comment
        });
        return {
          content: [{ type: "text", text: `Comment added to #${params.issue_number}` }]
        };
      }
    });

    pi.registerTool({
      name: "github_close",
      label: "Close GitHub Issue",
      description: "Close a GitHub issue",
      parameters: Type.Object({
        issue_number: Type.Number(),
        comment: Type.Optional(Type.String())
      }),
      async execute(id, params) {
        if (params.comment) {
          await octokit.rest.issues.createComment({
            owner: config.owner,
            repo: config.repo,
            issue_number: params.issue_number,
            body: params.comment
          });
        }
        await octokit.rest.issues.update({
          owner: config.owner,
          repo: config.repo,
          issue_number: params.issue_number,
          state: "closed"
        });
        return {
          content: [{ type: "text", text: `Issue #${params.issue_number} closed` }]
        };
      }
    });
  }
} satisfies OtterAssistExtension;
```

### Messaging Extension

Detects new inbox messages and provides a skill for the agent:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OtterAssistExtension, OAExtensionContext } from "otterassist";

interface MessagingConfig {
  connectionString: string;
}

let db: DatabaseConnection;

export default {
  name: "messaging",
  description: "Handle messages from the shared inbox database",
  version: "1.0.0",

  events: {
    async initialize(config: MessagingConfig, context: OAExtensionContext) {
      context.logger.info("Connecting to messaging database...");
      db = await connectToDatabase(config.connectionString);
    },

    async poll() {
      const unread = await db.query(`
        SELECT id, sender, subject, content 
        FROM messages 
        WHERE status = 'unread' AND assigned_to = 'otterassist'
      `);

      if (unread.length === 0) return [];

      // Mark as being processed
      await db.query(
        `UPDATE messages SET status = 'processing' WHERE id = ANY($1)`,
        [unread.map(m => m.id)]
      );

      return unread.map(msg => 
        `You have a new message in your inbox (ID: ${msg.id}).\n\n` +
        `From: ${msg.sender}\n` +
        `Subject: ${msg.subject}\n\n` +
        `Content:\n${msg.content}\n\n` +
        `Please handle this message and respond appropriately. ` +
        `Use the messaging skill for connection details.`
      );
    },

    async shutdown() {
      await db?.close();
    }
  },

  piExtension(pi: ExtensionAPI) {
    pi.registerSkill?.({
      name: "messaging",
      description: "Connect to the messaging database and send/receive messages",
      content: `# Messaging System

## Connection
The messaging database is accessible via usql:
\`\`\`bash
usql $MESSAGING_DB_URL
\`\`\`

## Schema
- \`messages\`: Incoming messages (id, sender, subject, content, status, assigned_to)
- \`outgoing\`: Outgoing messages (id, recipient, subject, body, sent_at)

## Common Operations

### Read processing messages
\`\`\`bash
usql $MESSAGING_DB_URL -c "SELECT * FROM messages WHERE status = 'processing'"
\`\`\`

### Send a reply
\`\`\`bash
usql $MESSAGING_DB_URL -c "INSERT INTO outgoing (recipient, subject, body) VALUES ('email@example.com', 'Subject', 'Body')"
\`\`\`

### Mark message complete
\`\`\`bash
usql $MESSAGING_DB_URL -c "UPDATE messages SET status = 'complete' WHERE id = <id>"
\`\`\`

## Guidelines
- Always mark messages as complete after handling
- Be professional and helpful in responses
- If you cannot handle a message, mark it as 'escalated' with a note`
    });
  }
} satisfies OtterAssistExtension;
```

## Best Practices

### 1. Bundle Related Functionality

Keep event sources and their corresponding tools/skills together in one extension:

```typescript
// ✅ Good: Event + skill bundled together
export default {
  name: "messaging",
  events: { /* detect messages */ },
  piExtension(pi) { /* provide messaging skill */ }
}

// ❌ Poor: Split across multiple extensions
// messaging-events.ts - only events
// messaging-skill.ts - only skill
```

### 2. Write Descriptive Event Messages

Events become user messages. Include all context the agent needs:

```typescript
// ✅ Good
return [`New GitHub issue: ${issue.title}
  
Repo: ${owner}/${repo}
Issue #${issue.number}
URL: ${issue.url}

${issue.body}

Please triage this issue. Use the github skill for common operations.`];

// ❌ Poor
return [`New issue: ${issue.title}`];
```

### 3. Use Configuration

Allow users to configure your extension:

```typescript
interface MyConfig {
  apiKey: string;
  pollInterval?: number;
}

events: {
  async initialize(config: MyConfig, context) {
    if (!config.apiKey) {
      throw new Error("apiKey is required in extension config");
    }
    // ...
  }
}
```

### 4. Handle Errors Gracefully

Don't let one extension crash the whole system:

```typescript
async poll() {
  try {
    const items = await fetchItems();
    return items.map(formatEvent);
  } catch (error) {
    // Log but don't throw - return empty array
    console.error("Failed to poll:", error);
    return [];
  }
}
```

### 5. Clean Up Resources

Always implement shutdown for long-running resources:

```typescript
let interval: Timer;

events: {
  initialize() {
    interval = setInterval(checkForUpdates, 1000);
  },
  shutdown() {
    clearInterval(interval);
  }
}
```

### 6. Log Meaningfully

Use the provided logger for debugging:

```typescript
events: {
  async initialize(config, context) {
    context.logger.info("Extension starting...");
    context.logger.debug(`Config: ${JSON.stringify(config)}`);
  }
}
```

## Debugging

### View Extension Loading

Run OtterAssist to see extension loading:

```bash
otterassist --once
```

Output includes:
```
🦦 OtterAssist daemon starting...
  Extensions: github, messaging, file-watcher
Loaded extension: github v1.0.0 - GitHub integration [events+pi]
Loading 2 pi extension(s)
```

### Check Configuration

```bash
otterassist --status
```

Shows which extensions are enabled/disabled.

### Test Extensions in Isolation

Create a test file to verify your extension loads:

```typescript
// test-extension.ts
import { loadExtension } from "otterassist";

const ext = await loadExtension("./my-extension.ts");
console.log("Name:", ext.name);
console.log("Has events:", !!ext.events);
console.log("Has pi extension:", !!ext.piExtension);

if (ext.events) {
  const messages = await ext.events.poll();
  console.log("Poll result:", messages);
}
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Extension not found | Wrong location | Check `~/.otterassist/extensions/` |
| Extension disabled | Config | Check `extensions.<name>.enabled: true` |
| Poll throws | API error | Wrap in try/catch, return `[]` |
| Tools not appearing | piExtension error | Check console for errors |

## Legacy Format

The original `EventSourceExtension` format is still supported but deprecated:

```typescript
// Legacy format (deprecated but works)
export default {
  name: "my-extension",
  description: "...",
  async poll() { return []; },
  async initialize(config, context) { }
};
```

This is equivalent to the new format with `events` only. New extensions should use `OtterAssistExtension`.
