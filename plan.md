# OtterAssist - Architecture Plan

## Overview

OtterAssist is an AI agent that runs locally on your computer. It operates on an event-driven model where events are queued and processed by an AI agent on a scheduled basis.

### Core Concept

1. Events are added to an event queue by extensions
2. A scheduler triggers on a configurable interval (cron-like)
3. When triggered, the orchestrator checks:
   - Is an agent already running? → Skip if yes
   - Are there pending events? → Skip if no
4. If conditions are met, start an agent run with events as context
5. The agent processes events and marks them complete via tools
6. Events only removed from queue when explicitly marked complete by agent

## Event Schema

Events have a simple structure:

```typescript
interface Event {
  id: string;            // Auto-generated UUID
  message: string;       // Custom message from extension
  progress: string;      // Progress notes from agent (updatable)
  createdAt: Date;
  status: "pending" | "completed";
}
```

### Key Points

- **id**: Auto-generated UUID when event is created
- **message**: The content describing what triggered the event
- **progress**: Agent can update this to track work done
- **status**: Events stay `pending` until agent explicitly marks `completed`

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          OtterAssist                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Extension System                                                   │
│   ┌────────────┐ ┌────────────┐ ┌────────────┐                      │
│   │ Event Src  │ │ Event Src  │ │ Event Src  │                      │
│   └─────┬──────┘ └─────┬──────┘ └─────┬──────┘                      │
│         └──────────────┼──────────────┘                              │
│                        ▼                                             │
│              ┌─────────────────┐                                     │
│              │  Event Queue    │                                     │
│              │   (SQLite)      │                                     │
│              └────────┬────────┘                                     │
│                       │                                              │
│  ┌──────────┐         │         ┌──────────────────────┐            │
│  │Scheduler │─────────┼────────►│  Agent Orchestrator  │            │
│  │(interval)│         │         │                      │            │
│  └──────────┘         │         │ - Check if running   │            │
│                       │         │ - Check pending      │            │
│                       │         │ - Start agent run    │            │
│                       │         └──────────┬───────────┘            │
│                       │                    │                         │
│                       │                    ▼                         │
│                       │    ┌────────────────────────────┐           │
│                       │    │     pi SDK Agent Session   │           │
│                       │    │                            │           │
│                       │    │  Tools: read, bash, edit,  │           │
│                       │    │  write + event tools       │           │
│                       │    │                            │           │
│                       │    │  Skills & Extensions:      │           │
│                       │    │  fully customizable        │           │
│                       │    └────────────────────────────┘           │
│                                                                      │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │                    Setup Wizard                             │    │
│   │  - Configure poll interval                                  │    │
│   │  - Enable/disable extensions                                │    │
│   │  - Configure extension options                              │    │
│   └────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Event Queue

**Storage**: SQLite (built into Bun)

**Responsibilities**:
- Persist events to disk
- Query pending events
- Update event progress
- Mark events complete

**API**:
```typescript
interface EventQueue {
  add(message: string): Promise<Event>;
  getPending(): Promise<Event[]>;
  getById(id: string): Promise<Event | null>;
  updateProgress(id: string, progress: string): Promise<void>;
  markComplete(id: string): Promise<void>;
  purgeCompleted(olderThan: Date): Promise<number>;
}
```

### 2. Extension System (Event Sources)

Extensions are TypeScript modules that produce events.

**Interface**:
```typescript
interface EventSourceExtension {
  name: string;
  description: string;
  configSchema?: TSchema;
  defaultConfig?: unknown;
  initialize?(config: unknown, context: ExtensionContext): Promise<void>;
  shutdown?(): Promise<void>;
  poll(): Promise<string[]>;  // Returns messages to add to queue
}

interface ExtensionContext {
  configDir: string;
  logger: Logger;
  events: EventEmitter;
}
```

**Discovery Locations**:
| Location | Scope |
|----------|-------|
| `~/.otterassist/extensions/*.ts` | Global |
| `~/.otterassist/extensions/*/index.ts` | Global (directory) |
| `./.otterassist/extensions/*.ts` | Project-local |

### 3. Scheduler

Interval-based trigger that polls extensions and starts orchestrator.

**Behavior**:
- Runs on configured `pollIntervalSeconds`
- Each tick:
  1. Call `poll()` on all enabled extensions
  2. Add returned messages to event queue
  3. Trigger `orchestrator.checkAndRun()`

### 4. Agent Orchestrator

Manages agent runs, ensures only one at a time.

**Logic**:
```typescript
async checkAndRun(): Promise<void> {
  if (this.isRunning) return;
  
  const events = await this.eventQueue.getPending();
  if (events.length === 0) return;
  
  this.isRunning = true;
  try {
    await this.runAgent(events);
  } catch (error) {
    // Events stay pending on failure
    logger.error('Agent run failed', error);
  } finally {
    this.isRunning = false;
  }
}
```

### 5. Agent Runner (pi SDK)

Uses pi SDK for agent execution with full extensibility.

**Features**:
- Basic coding tools (read, bash, edit, write)
- Custom event management tools
- Loads pi extensions/skills from `~/.otterassist/agent/`
- Custom system prompt for event-driven context

**Custom Tools**:
```typescript
list_events() => Event[]
update_event_progress(eventId: string, progress: string) => void
complete_event(eventId: string) => void
```

## Configuration

**Location**: `~/.otterassist/config.json`

**Schema**:
```typescript
interface Config {
  pollIntervalSeconds: number;  // Default: 300
  extensions: {
    [extensionName: string]: {
      enabled: boolean;
      config?: Record<string, unknown>;
    };
  };
}
```

**Example**:
```json
{
  "pollIntervalSeconds": 300,
  "extensions": {
    "email-watcher": {
      "enabled": true,
      "config": {
        "imapHost": "imap.gmail.com",
        "folder": "INBOX"
      }
    },
    "github-issues": {
      "enabled": true,
      "config": {
        "repo": "owner/repo",
        "labels": ["help wanted"]
      }
    }
  }
}
```

## Directory Structure

```
~/.otterassist/
├── config.json           # Main configuration
├── events.db             # SQLite event queue
├── agent/                # pi agent resources
│   ├── extensions/       # pi extensions (for agent runs)
│   ├── skills/           # Skills for agent
│   ├── prompts/          # Prompt templates
│   ├── auth.json         # API keys
│   └── models.json       # Custom models (optional)
└── extensions/           # Event source extensions
    ├── email-watcher.ts
    ├── github-issues/
    │   └── index.ts
    └── ...

Project:
./.otterassist/
└── extensions/           # Project-local event sources
```

## CLI Interface

```bash
otterassist              # Start daemon (foreground)
otterassist --setup      # Run setup wizard
otterassist --once       # Run one check immediately, then exit
otterassist --status     # Show current status
otterassist --events     # List pending events
otterassist --config     # Specify config file path
otterassist --help       # Show help
otterassist --version    # Show version
```

## Startup Flow

```
1. Parse CLI args
   ├─► --setup    → Run setup wizard, exit
   ├─► --once     → Run one check immediately, exit
   └─► (default)  → Start daemon

2. Load config from ~/.otterassist/config.json
   └─► If not found, run setup wizard

3. Initialize event queue (SQLite)

4. Load enabled event source extensions
   └─► Call initialize() on each

5. Start scheduler
   └─► Every N seconds:
       ├─► Call poll() on each extension
       ├─► Add returned messages to queue
       └─► Call orchestrator.checkAndRun()

6. Handle shutdown (SIGINT, SIGTERM)
   └─► Call shutdown() on each extension
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Simple event structure** | Just id, message, progress, createdAt, status |
| **SQLite for queue** | Built into Bun, simple, reliable |
| **Single agent run** | Prevents resource exhaustion, simplifies state |
| **Events stay pending on failure** | No data loss, agent can retry |
| **Agent marks events complete** | Explicit control, agent decides when ready |
| **Progress field** | Agent can leave notes on partial work |
| **Extension system like pi** | Familiar patterns, TypeScript modules |
| **Separate agent dir** | `~/.otterassist/agent` separate from `~/.pi/agent` |
| **Full pi extensibility** | Agent runs can use all pi features |
| **Setup wizard** | Easy configuration, no manual JSON editing |

## Implementation Roadmap

| Phase | Issue | Title |
|-------|-------|-------|
| 1 | #1 | Project Structure & Foundation |
| 1 | #2 | Event Queue (SQLite) |
| 1 | #3 | Configuration System |
| 1 | #4 | Extension System - Event Sources |
| 2 | #7 | Agent Runner (pi SDK Integration) |
| 2 | #6 | Agent Orchestrator |
| 2 | #5 | Scheduler |
| 3 | #8 | Setup Wizard |
| 3 | #9 | CLI Interface |
| 4 | #10 | Example Extension: File Watcher |
| 4 | #12 | Testing & Quality |
| 4 | #11 | Documentation |
| 5 | #27 | Extension Installer |

**Recommended build order**: 1 → 2 → 3 → 4 → 7 → 6 → 5 → 8 → 9 → 10 → 12 → 11 → 27

## Extension Installer Design (#27)

### CLI Commands

```bash
# Install from local path
otterassist install <path>

# Install with symlink (for development)
otterassist install <path> --link

# Install from git URL
otterassist install <git-url>

# List installed extensions
otterassist extensions list
otterassist extensions

# Show extension details
otterassist extensions show <name>

# Enable/disable extensions
otterassist enable <name>
otterassist disable <name>

# Uninstall extension
otterassist uninstall <name>
```

### Install Sources

| Source | Example | Behavior |
|--------|---------|----------|
| Local file | `./my-extension.ts` | Copy to `extensions/my-extension/` |
| Local directory | `./my-extension/` | Copy entire directory |
| Git URL (GitHub) | `github:user/repo` | Clone to temp, copy extension |
| Git URL (full) | `https://github.com/user/repo` | Clone to temp, copy extension |
| Git URL (subdir) | `github:user/repo/tree/main/extensions/foo` | Clone, copy specific subdir |

### Installation Process

1. **Resolve source** - Determine if path, URL, or shorthand
2. **Fetch extension** - Copy local or clone git to temp
3. **Validate** - Load and verify valid `OtterAssistExtension`
4. **Check conflicts** - Error if exists (unless `--force`)
5. **Install** - Copy or symlink to `~/.otterassist/extensions/<name>/`
6. **Dependencies** - Run `bun install` if `package.json` exists
7. **Update config** - Add with `enabled: true` (or `--no-enable`)

### Extension Package Structure

**Single file:**
```
my-extension.ts    # Exports OtterAssistExtension as default
```

**Full package:**
```
my-extension/
├── index.ts          # Required: exports OtterAssistExtension
├── package.json      # Optional: dependencies
├── otterassist.json  # Optional: metadata (name overrides, version, etc.)
└── README.md         # Optional: documentation
```

### Installer API

```typescript
// src/extensions/installer.ts

interface InstallOptions {
  link?: boolean;      // Create symlink instead of copy
  force?: boolean;     // Overwrite existing
  enable?: boolean;    // Auto-enable in config (default: true)
  subdir?: string;     // Subdirectory within git repo
}

interface InstalledExtension {
  name: string;
  description: string;
  path: string;
  version?: string;
  linked: boolean;
  gitUrl?: string;
  installedAt: Date;
}

interface InstallResult {
  extension: InstalledExtension;
  dependenciesInstalled: boolean;
  wasLinked: boolean;
  wasEnabled: boolean;
}

// Core functions
async function installExtension(source: string, options?: InstallOptions): Promise<InstallResult>;
async function uninstallExtension(name: string): Promise<void>;
async function listInstalledExtensions(): Promise<InstalledExtension[]>;
async function getInstalledExtension(name: string): Promise<InstalledExtension | null>;
async function enableExtension(name: string): Promise<void>;
async function disableExtension(name: string): Promise<void>;
```

### Metadata File (otterassist.json)

Optional file for extension metadata:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "Your Name",
  "repository": "https://github.com/user/otterassist-my-extension",
  "keywords": ["github", "issues"],
  "piExtensions": ["./pi-tools.ts"]
}
```

### Git URL Formats

| Format | Resolves To |
|--------|-------------|
| `github:user/repo` | `https://github.com/user/repo.git` |
| `gitlab:user/repo` | `https://gitlab.com/user/repo.git` |
| `https://...` | Used directly |
| `git+https://...` | Used directly (strip `git+`) |

For subdirectories:
- `github:user/repo/tree/main/extensions/foo`
- Parse URL to extract branch and path

## pi SDK Integration

OtterAssist uses the pi coding agent SDK for running AI agents.

**Key imports**:
```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  codingTools,
} from "@mariozechner/pi-coding-agent";
```

**Session creation**:
```typescript
const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "~/.otterassist/agent",
  resourceLoader: new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: "~/.otterassist/agent",
  }),
  tools: [...codingTools],
  customTools: [listEventsTool, updateProgressTool, completeEventTool],
  sessionManager: SessionManager.inMemory(),
});
```

**References**:
- pi SDK docs: `/usr/lib/node_modules/@mariozechner/pi-coding-agent/docs/sdk.md`
- pi Extension docs: `/usr/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
