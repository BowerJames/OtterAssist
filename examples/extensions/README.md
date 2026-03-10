# Example Extensions

This directory contains example OtterAssist extensions demonstrating the extension system.

## Examples

| Example | Description |
|---------|-------------|
| [hello.ts](./hello.ts) | Minimal extension with events only |
| [file-watcher.ts](./file-watcher.ts) | Watch a directory for new files |
| [scheduled-reminder.ts](./scheduled-reminder.ts) | Periodic reminders at specific times |
| [webhook-receiver.ts](./webhook-receiver.ts) | Receive webhooks via local server |
| [messaging/](./messaging/) | Bidirectional user-agent messaging via SQLite |

## Using Examples

### Option 1: Copy to Extensions Directory

```bash
# Copy an example to your extensions directory
cp file-watcher.ts ~/.otterassist/extensions/

# Enable in config
# Edit ~/.otterassist/config.json:
{
  "extensions": {
    "file-watcher": {
      "enabled": true,
      "config": {
        "watchPath": "~/Downloads",
        "pattern": "*.pdf"
      }
    }
  }
}
```

### Option 2: Symlink for Development

```bash
# Symlink for live development
ln -s $(pwd)/file-watcher.ts ~/.otterassist/extensions/file-watcher.ts
```

### Option 3: Use as Template

Copy an example as a starting point for your own extension:

```bash
cp hello.ts ~/.otterassist/extensions/my-extension.ts
# Edit my-extension.ts with your logic
```

## Testing Extensions

Test that an extension loads correctly:

```bash
# Run once to see extension loading
otterassist --once

# Check status
otterassist --status
```

## Extension Structure

All examples follow this pattern:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OtterAssistExtension, OAExtensionContext } from "otterassist";

interface MyConfig {
  // Configuration options
}

export default {
  name: "my-extension",
  description: "What this extension does",
  version: "1.0.0",

  // Event source - produces events
  events: {
    async initialize(config: MyConfig, context: OAExtensionContext) {
      // Setup
    },
    async poll() {
      // Return events
      return ["Event message"];
    },
    async shutdown() {
      // Cleanup
    }
  },

  // Pi extension - adds capabilities
  piExtension(pi: ExtensionAPI) {
    // Register tools, skills, hooks, commands
  }
} satisfies OtterAssistExtension;
```

## Learning Path

1. **Start with [hello.ts](./hello.ts)** - Understand the basic structure
2. **Read [file-watcher.ts](./file-watcher.ts)** - See events + skill together
3. **Study [scheduled-reminder.ts](./scheduled-reminder.ts)** - Learn about state management
4. **Explore [webhook-receiver.ts](./webhook-receiver.ts)** - See HTTP server integration
5. **Try [messaging/](./messaging/)** - Full-featured extension with SQLite database

## Dependencies

Some examples use additional npm packages. Install them in the extensions directory:

```bash
cd ~/.otterassist/extensions
bun add chokidar  # For file watching
bun add express   # For webhooks
```

Or add a `package.json` next to your extension.
