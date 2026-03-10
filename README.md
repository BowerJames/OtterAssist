# OtterAssist 🦦

OtterAssist is an event-driven AI agent that runs locally on your computer. It monitors for events from various sources and uses an AI agent to process them automatically.

## What OtterAssist Does

- **Monitors for events** - Polls extensions that watch for new items (GitHub issues, emails, files, etc.)
- **Queues events** - Persists events in SQLite until processed
- **Processes with AI** - Uses an embedded AI agent to understand and act on events
- **Extends with tools** - Extensions can add custom tools, skills, and hooks

## Example Use Cases

- **GitHub Issues** - Detect new issues, triage, comment, close
- **Email Inbox** - Monitor shared inbox, draft responses, escalate
- **File Watcher** - Detect new files, process, route, summarize
- **Support Tickets** - Monitor queue, categorize, respond

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- An AI provider API key (Anthropic, OpenAI, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/BowerJames/OtterAssist.git
cd OtterAssist

# Install dependencies
bun install

# Build
bun run build
```

### Setup

Run the setup wizard to configure OtterAssist:

```bash
bun run start -- --setup
```

This will:
1. Discover available extensions
2. Configure the poll interval
3. Enable/disable extensions
4. Save configuration to `~/.otterassist/config.json`

### Set API Key

OtterAssist uses pi's authentication system. Set your API key:

```bash
# For Anthropic
export ANTHROPIC_API_KEY=your-key-here

# For OpenAI
export OPENAI_API_KEY=your-key-here
```

Or use the `/login` command in interactive mode.

### Run

```bash
# Start the daemon (foreground)
bun run start

# Or run once and exit
bun run start -- --once
```

## CLI Usage

```
🦦 OtterAssist - AI Agent for your computer

USAGE:
  otterassist [OPTIONS]
  otterassist <COMMAND> [ARGS]

OPTIONS:
  --setup          Run the setup wizard to configure OtterAssist
  --once           Run one check immediately, then exit
  --status         Show current status
  --events         List pending events
  -c, --config     Specify config file path
  -h, --help       Show this help message
  -v, --version    Show version

COMMANDS:
  install <source>    Install extension from path or git URL
    --link            Create symlink instead of copy (for development)
    --force           Overwrite existing extension
    --no-enable       Don't auto-enable after install

  uninstall <name>    Uninstall an extension

  extensions [list]   List installed extensions
  extensions show     Show details for an extension

  enable <name>       Enable an extension
  disable <name>      Disable an extension

EXAMPLES:
  otterassist                        Start the daemon (foreground)
  otterassist --setup                Configure OtterAssist
  otterassist --once                 Process events once and exit
  otterassist --status               Show configuration status
  otterassist --events               List pending events

  otterassist install ./my-extension
  otterassist install ./my-extension --link
  otterassist install github:user/repo
  otterassist install https://github.com/user/repo.git

  otterassist extensions
  otterassist enable github-issues
  otterassist disable file-watcher
  otterassist uninstall my-extension
```

## Configuration

Configuration is stored in `~/.otterassist/config.json`:

```json
{
  "pollIntervalSeconds": 60,
  "extensions": {
    "github": {
      "enabled": true,
      "config": {
        "owner": "myorg",
        "repo": "myrepo",
        "token": "$GITHUB_TOKEN"
      }
    },
    "messaging": {
      "enabled": true,
      "config": {
        "connectionString": "$MESSAGING_DB_URL"
      }
    },
    "file-watcher": {
      "enabled": false
    }
  }
}
```

See [Configuration Documentation](./docs/configuration.md) for details.

## Extensions

Extensions add new event sources and capabilities to OtterAssist.

### Installing Extensions

```bash
# Install from local file
otterassist install ./my-extension.ts

# Install from local directory
otterassist install ./my-extension/

# Install with symlink (for development)
otterassist install ./my-extension --link

# Install from GitHub
otterassist install github:user/otterassist-extensions

# Install from git URL with subdirectory
otterassist install github:user/repo/tree/main/extensions/github

# List installed extensions
otterassist extensions

# Enable/disable extensions
otterassist enable my-extension
otterassist disable my-extension

# Uninstall
otterassist uninstall my-extension
```

### Extension Structure

```typescript
// ~/.otterassist/extensions/my-extension.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { OtterAssistExtension } from "otterassist";

export default {
  name: "my-extension",
  description: "Does something useful",

  // Event source: produces events for the queue
  events: {
    async poll() {
      // Check for new items...
      return ["New item detected! Please handle it."];
    }
  },

  // Pi extension: provides capabilities to the agent
  piExtension(pi: ExtensionAPI) {
    pi.registerTool({
      name: "my_tool",
      label: "My Tool",
      description: "Does something useful",
      // ...
    });
  }
} satisfies OtterAssistExtension;
```

### What Extensions Can Do

| Capability | Description |
|------------|-------------|
| **Event Sources** | Poll for new items and create events |
| **Tools** | Add LLM-callable actions (APIs, databases, etc.) |
| **Skills** | Add instruction packages for handling specific tasks |
| **Hooks** | React to agent events (tool calls, messages, etc.) |
| **Commands** | Add slash commands |

See [Extension Development](./docs/extensions.md) for the full guide.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  Scheduler (runs every N seconds)                               │
│    │                                                            │
│    ├─► Poll extensions for events                               │
│    │     └─► "New GitHub issue: Bug in login"                   │
│    │                                                            │
│    ├─► Add events to SQLite queue                               │
│    │                                                            │
│    └─► Trigger Orchestrator                                     │
│          │                                                      │
│          └─► If pending events exist:                           │
│                │                                                │
│                └─► Run AI Agent                                 │
│                      │                                          │
│                      ├─► Agent sees: "You have 1 pending event" │
│                      ├─► Agent uses tools: read, bash, etc.     │
│                      ├─► Agent uses extension tools             │
│                      └─► Agent marks event complete             │
└─────────────────────────────────────────────────────────────────┘
```

See [Architecture Documentation](./docs/architecture.md) for details.

## Project Structure

```
src/
├── cli/           # Command-line interface
├── config/        # Configuration loading
├── core/          # Core components (scheduler, queue, runner)
├── extensions/    # Extension system
├── setup/         # Setup wizard
└── types/         # TypeScript interfaces

docs/
├── architecture.md    # System architecture
├── configuration.md   # Configuration reference
└── extensions.md      # Extension development guide
```

## Development

```bash
# Run in development mode
bun run dev

# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format

# Build
bun run build
```

## Documentation

- [Architecture](./docs/architecture.md) - How OtterAssist works
- [Configuration](./docs/configuration.md) - Configuration options
- [Extension Development](./docs/extensions.md) - Creating extensions
- [Example Extensions](./examples/extensions/README.md) - Ready-to-use examples

## Examples

The `examples/extensions/` directory contains example extensions you can use as templates:

| Example | Description |
|---------|-------------|
| [hello.ts](./examples/extensions/hello.ts) | Minimal extension with events only |
| [file-watcher.ts](./examples/extensions/file-watcher.ts) | Watch a directory for new files |
| [scheduled-reminder.ts](./examples/extensions/scheduled-reminder.ts) | Periodic reminders at specific times |
| [webhook-receiver.ts](./examples/extensions/webhook-receiver.ts) | Receive webhooks via local server |
| [messaging/](./examples/extensions/messaging/) | Bidirectional user-agent communication via SQLite |

## License

MIT
