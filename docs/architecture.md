# Architecture

OtterAssist is an event-driven AI agent that runs locally on your computer. It polls for events from extensions, queues them, and processes them using an embedded AI agent.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OtterAssist                                     │
│                                                                              │
│  ┌─────────────┐                                                            │
│  │    CLI      │  Command-line interface (--setup, --once, --status, etc.)  │
│  └──────┬──────┘                                                            │
│         │                                                                    │
│         v                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Scheduler                                   │    │
│  │                                                                      │    │
│  │   • Runs on configurable interval (pollIntervalSeconds)             │    │
│  │   • Triggers extension polling                                       │    │
│  │   • Triggers orchestrator after polling                             │    │
│  └──────────────────────────┬──────────────────────────────────────────┘    │
│                             │                                                │
│         ┌───────────────────┴───────────────────┐                          │
│         v                                        v                          │
│  ┌─────────────────────┐              ┌─────────────────────┐              │
│  │  ExtensionManager   │              │     EventQueue      │              │
│  │                     │              │      (SQLite)       │              │
│  │  • Load extensions  │   messages   │                     │              │
│  │  • Poll event       │─────────────►│  • Persist events   │              │
│  │    sources          │              │  • Track status     │              │
│  │  • Collect pi       │              │  • Purge completed  │              │
│  │    extensions       │              │                     │              │
│  └──────────┬──────────┘              └──────────┬──────────┘              │
│             │                                    │                          │
│             │ pi extensions                      │ pending events           │
│             v                                    v                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          Orchestrator                                │   │
│  │                                                                      │   │
│  │   • Ensures only one agent run at a time                           │   │
│  │   • Checks for pending events                                       │   │
│  │   • Triggers AgentRunner when events exist                         │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                                │
│                             v                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AgentRunner                                  │   │
│  │                                                                      │   │
│  │   • Embeds pi agent via SDK                                         │   │
│  │   • Passes pi extensions from ExtensionManager                      │   │
│  │   • Provides event management tools                                 │   │
│  │   • Builds event context for agent                                  │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                                │
│                             v                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Embedded Pi Agent                                │   │
│  │                                                                      │   │
│  │   • LLM makes decisions                                             │   │
│  │   • Uses tools (read, bash, edit, write, custom)                    │   │
│  │   • Has access to skills from extensions                            │   │
│  │   • Updates event progress / marks complete                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### CLI (`src/cli/`)

The command-line interface handles user interaction:

- **`parseArgs()`** - Parses command-line arguments
- **`runSetup()`** - Runs the setup wizard
- **`runOnce()`** - Single check mode
- **`runDaemon()`** - Continuous daemon mode
- **`showStatus()`** - Display current status
- **`listEvents()`** - List pending events

The CLI initializes all components and wires them together.

### Scheduler (`src/core/scheduler.ts`)

The scheduler is the heartbeat of OtterAssist:

**Responsibilities:**
- Run on a configurable interval
- Prevent overlapping ticks (only one at a time)
- Graceful shutdown support

**Tick Cycle:**
1. Poll all extensions via ExtensionManager
2. Add returned messages to EventQueue
3. Trigger Orchestrator to process events

```typescript
const scheduler = new Scheduler({
  pollIntervalSeconds: 60,
  extensionManager,
  eventQueue,
  orchestrator,
  logger
});

scheduler.start();
await scheduler.stop();
```

### ExtensionManager (`src/extensions/manager.ts`)

Manages the lifecycle of OtterAssist extensions:

**Responsibilities:**
- Discover extensions from `~/.otterassist/extensions/`
- Load and validate extension modules
- Filter by config (enabled/disabled)
- Initialize event sources with config and context
- Poll event sources on each tick
- Collect pi extension factories for the agent

```typescript
const manager = new ExtensionManager(config, logger);
await manager.loadAll();

// Get messages from event sources
const messages = await manager.pollAll();

// Get pi extensions for agent
const piFactories = manager.getPiExtensions();

await manager.shutdownAll();
```

### EventQueue (`src/core/queue.ts`)

Persistent queue for events using SQLite:

**Responsibilities:**
- Store events with unique IDs and timestamps
- Track event status (pending/completed)
- Support progress updates
- Purge old completed events

**Event Structure:**
```typescript
interface Event {
  id: string;           // UUID
  message: string;      // Event message (becomes user message to agent)
  progress: string;     // Progress notes (updated by agent)
  createdAt: Date;      // Creation timestamp
  status: "pending" | "completed";
}
```

**Database Location:** `~/.otterassist/events.db`

### Orchestrator (`src/core/orchestrator.ts`)

Ensures safe, non-overlapping agent runs:

**Responsibilities:**
- Prevent concurrent agent runs
- Only start when pending events exist
- Track run state (running, run ID)
- Handle failures gracefully (events stay pending)

```typescript
const orchestrator = new Orchestrator({
  eventQueue,
  agentRunner,
  logger
});

const result = await orchestrator.checkAndRun();
// result.started - whether a run was started
// result.skipReason - why it was skipped (if so)
// result.agentResult - result from agent (if run)
```

### AgentRunner (`src/core/runner.ts`)

Runs the embedded AI agent using the pi SDK:

**Responsibilities:**
- Create pi agent session with custom system prompt
- Register event management tools
- Pass pi extensions from ExtensionManager
- Build event context for agent
- Subscribe to agent events for logging

**Tools Provided:**
- `list_events` - List pending events
- `update_event_progress` - Update progress notes
- `complete_event` - Mark event complete
- Plus standard pi tools: `read`, `bash`, `edit`, `write`

### Extension System (`src/extensions/`)

The extension system allows users to extend OtterAssist:

**Extension Interface:**
```typescript
interface OtterAssistExtension {
  name: string;
  description: string;
  version?: string;
  
  // Event source - produces events for the queue
  events?: {
    poll(): Promise<string[]>;
    initialize?(config, context): Promise<void>;
    shutdown?(): Promise<void>;
  };
  
  // Pi extension - provides tools, skills, hooks
  piExtension?: (pi: ExtensionAPI) => void;
}
```

**Discovery Locations:**
- `~/.otterassist/extensions/*.ts` - Global
- `./.otterassist/extensions/*.ts` - Project-local (overrides)

## Data Flow

### Event Processing Flow

```
1. Scheduler tick starts
   │
   ├─► 2. ExtensionManager.pollAll()
   │      └─► For each extension with events:
   │            └─► extension.events.poll() → ["message1", "message2", ...]
   │
   ├─► 3. EventQueue.add(message) for each message
   │      └─► Stored in SQLite with status="pending"
   │
   └─► 4. Orchestrator.checkAndRun()
          │
          ├─► Check: isRunning? → Skip if true
          ├─► Check: pending events? → Skip if none
          │
          └─► 5. AgentRunner.run(events)
                 │
                 ├─► Create pi session with pi extensions
                 ├─► Build context: "You have N pending events..."
                 ├─► Send prompt to agent
                 │
                 └─► Agent processes:
                       ├─► list_events tool
                       ├─► Read files, run commands
                       ├─► update_event_progress tool
                       └─► complete_event tool
```

### Extension Loading Flow

```
1. ExtensionManager.loadAll()
   │
   ├─► discoverExtensions()
   │     └─► Scan ~/.otterassist/extensions/
   │     └─► Scan ./.otterassist/extensions/
   │
   └─► For each extension path:
          │
          ├─► loadExtension(path)
          │     └─► Import TypeScript module
          │     └─► Validate structure
          │     └─► Normalize to LoadedExtension
          │
          ├─► Check config.extensions[name].enabled
          │     └─► Skip if disabled
          │
          ├─► If events.initialize exists:
          │     └─► Call with config and context
          │
          ├─► Store extension
          │
          └─► If piExtension exists:
                └─► Add to piExtensions array
```

## Design Decisions

### Why SQLite for the Event Queue?

- **Persistence**: Events survive restarts
- **Simplicity**: No external database required
- **Performance**: Fast reads/writes for small datasets
- **Concurrency**: Safe for single-process access

### Why Polling Instead of Webhooks?

- **Simplicity**: No need to expose ports or manage callbacks
- **Reliability**: Works behind NATs, firewalls
- **Control**: Easy to rate-limit, pause, resume
- **Compatibility**: Works with any event source

Webhooks could be added as an alternative in the future.

### Why Embed Pi Instead of Running Separately?

- **Integration**: Direct access to tools and events
- **Performance**: No IPC overhead
- **Simplicity**: Single process to manage
- **Shared State**: Extensions can share context with agent

### Why Separate Event Sources from Pi Extensions?

Event sources and pi extensions serve different purposes:

| Event Source | Pi Extension |
|--------------|--------------|
| Produces events | Handles events |
| Runs in OtterAssist process | Runs in pi agent context |
| Polls on schedule | Reacts to agent actions |
| Returns messages | Registers tools/skills/hooks |

Bundling them together in one extension keeps related functionality cohesive.

## File Structure

```
src/
├── cli/
│   └── index.ts           # CLI entry point
│
├── config/
│   ├── loader.ts          # Config loading/saving
│   └── schema.ts          # Config validation
│
├── core/
│   ├── emitter.ts         # Simple EventEmitter
│   ├── logger.ts          # Console logger
│   ├── orchestrator.ts    # Agent run management
│   ├── queue.ts           # SQLite event queue
│   ├── runner.ts          # Pi SDK integration
│   ├── scheduler.ts       # Interval-based polling
│   └── tools/
│       └── index.ts       # Event management tools
│
├── extensions/
│   ├── index.ts           # Exports
│   ├── loader.ts          # Extension discovery/loading
│   └── manager.ts         # Extension lifecycle
│
├── setup/
│   ├── index.ts           # Setup wizard
│   ├── wizard.ts          # Wizard implementation
│   └── screens/           # Setup UI screens
│
├── types/
│   └── index.ts           # TypeScript interfaces
│
└── index.ts               # Main entry point
```

## Dependencies

### Runtime

- **Bun** - JavaScript runtime
- **@mariozechner/pi-coding-agent** - Embedded AI agent SDK
- **better-sqlite3** - SQLite bindings

### Development

- **TypeScript** - Type checking
- **Biome** - Linting and formatting

## Extension Points

OtterAssist can be extended at several points:

1. **Event Sources** - Add new event producers
2. **Tools** - Add LLM-callable actions
3. **Skills** - Add instruction packages
4. **Hooks** - React to agent events
5. **Commands** - Add slash commands

See [Extension Development](./extensions.md) for details.

## Performance Considerations

- **Polling Interval**: Lower values = more responsive but higher CPU/API usage
- **Event Batch Size**: Many events in one tick = longer agent runs
- **Extension Count**: More extensions = slower startup and polling
- **SQLite Size**: Many completed events = slower queries (use purge)

## Security Considerations

- Extensions run with full system access
- Only install extensions from trusted sources
- API keys stored in `~/.otterassist/agent/auth.json` (pi managed)
- Event messages may contain sensitive data (persisted in SQLite)
