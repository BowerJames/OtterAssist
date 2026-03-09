# Configuration

OtterAssist is configured via a JSON file at `~/.otterassist/config.json`.

## Quick Reference

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

## Configuration File

### Location

The configuration file is located at:

```
~/.otterassist/config.json
```

### Creation

Run the setup wizard to create a configuration:

```bash
otterassist --setup
```

Or create it manually:

```bash
mkdir -p ~/.otterassist
cat > ~/.otterassist/config.json << 'EOF'
{
  "pollIntervalSeconds": 60,
  "extensions": {}
}
EOF
```

## Configuration Options

### pollIntervalSeconds

How often (in seconds) OtterAssist polls extensions for new events.

| Property | Value |
|----------|-------|
| Type | `number` |
| Default | `60` |
| Minimum | `1` |

```json
{
  "pollIntervalSeconds": 30
}
```

Lower values = more responsive but higher resource usage.

### extensions

Configuration for each installed extension.

```json
{
  "extensions": {
    "<extension-name>": {
      "enabled": true,
      "config": {
        // Extension-specific options
      }
    }
  }
}
```

#### enabled

Whether the extension is loaded and polled.

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `false` |

```json
{
  "extensions": {
    "my-extension": {
      "enabled": true
    }
  }
}
```

#### config

Extension-specific configuration. The schema depends on the extension.

```json
{
  "extensions": {
    "github": {
      "enabled": true,
      "config": {
        "owner": "myorg",
        "repo": "myrepo",
        "token": "$GITHUB_TOKEN"
      }
    }
  }
}
```

See the extension's documentation for available options.

## Directory Structure

OtterAssist uses the following directory structure:

```
~/.otterassist/
├── config.json        # Main configuration
├── events.db          # SQLite event queue
├── extensions/        # Extension modules
│   ├── github.ts
│   ├── messaging.ts
│   └── my-extension/
│       └── index.ts
└── agent/             # Pi agent files
    └── auth.json      # API keys (managed by pi)
```

## Environment Variables

Extensions can reference environment variables in their config:

```json
{
  "extensions": {
    "github": {
      "enabled": true,
      "config": {
        "token": "$GITHUB_TOKEN"
      }
    }
  }
}
```

The extension receives the literal string `$GITHUB_TOKEN` and can resolve it:

```typescript
import { env } from "node:process";

events: {
  async initialize(config) {
    const token = config.token.startsWith("$") 
      ? env[config.token.slice(1)]
      : config.token;
  }
}
```

## CLI Configuration

You can specify a custom config file path:

```bash
otterassist --config /path/to/config.json
otterassist -c /path/to/config.json
```

## Validation

OtterAssist validates the configuration on startup. Invalid configurations will cause an error.

### Common Validation Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `pollIntervalSeconds must be >= 1` | Value too low | Set to at least 1 |
| `extensions must be an object` | Wrong type | Use `{}` not `[]` |
| `enabled must be a boolean` | Wrong type | Use `true`/`false` |

## First Run Detection

If no configuration exists, OtterAssist will prompt you to run setup:

```bash
🦦 Welcome to OtterAssist!
Run 'otterassist --setup' to get started.
```

## Reloading Configuration

Currently, configuration is only read at startup. To apply changes:

1. Stop OtterAssist (Ctrl+C)
2. Edit `~/.otterassist/config.json`
3. Start OtterAssist again

## Extension Config Schemas

Extensions may define a `configSchema` using JSON Schema:

```typescript
export default {
  name: "my-extension",
  configSchema: {
    type: "object",
    properties: {
      apiKey: { type: "string" },
      maxItems: { type: "number", default: 10 }
    },
    required: ["apiKey"]
  }
}
```

This schema is informational - validation is currently not enforced at runtime, but may be added in the future.

## Example Configurations

### Minimal

```json
{
  "pollIntervalSeconds": 60,
  "extensions": {}
}
```

### With Multiple Extensions

```json
{
  "pollIntervalSeconds": 30,
  "extensions": {
    "file-watcher": {
      "enabled": true,
      "config": {
        "watchPath": "~/Downloads",
        "pattern": "*.pdf"
      }
    },
    "github": {
      "enabled": true,
      "config": {
        "owner": "myorg",
        "repo": "myrepo",
        "token": "$GITHUB_TOKEN",
        "watchLabels": ["bug", "support"]
      }
    },
    "messaging": {
      "enabled": true,
      "config": {
        "connectionString": "$MESSAGING_DB_URL"
      }
    },
    "slack": {
      "enabled": false
    }
  }
}
```

### High-Frequency Polling

```json
{
  "pollIntervalSeconds": 10,
  "extensions": {
    "urgent-tickets": {
      "enabled": true,
      "config": {
        "priority": "high"
      }
    }
  }
}
```

## See Also

- [Extension Development](./extensions.md) - Creating extensions
- [Architecture](./architecture.md) - How components work together
