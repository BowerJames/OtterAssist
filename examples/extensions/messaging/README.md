# Messaging Extension

Enables bidirectional communication between the user and the AI agent via a SQLite database.

## Installation

```bash
otterassist install ./examples/extensions/messaging
```

## How It Works

1. **User sends a message** by inserting into the SQLite database
2. **Extension polls** for unread user messages and creates events
3. **Agent receives event** with the message ID
4. **Agent reads and responds** using `usql` via the bash tool
5. **User checks responses** by querying the database

## Database

**Location**: `~/.otterassist/messages.db`

**Schema**:
```sql
messages (
  id         TEXT PRIMARY KEY,  -- UUID
  role       TEXT,              -- 'user' or 'agent'
  content    TEXT,              -- Message content
  parent_id  TEXT,              -- Thread parent (NULL = new thread)
  status     TEXT,              -- 'unread', 'read', 'responded'
  created_at TEXT               -- ISO timestamp
)
```

## Usage

### Send a Message

```bash
usql ~/.otterassist/messages.db -c "
  INSERT INTO messages (id, role, content, parent_id, status, created_at)
  VALUES (
    '$(uuidgen | tr 'A-Z' 'a-z')',
    'user',
    'Can you review the latest PR?',
    NULL,
    'unread',
    datetime('now')
  )
"
```

### Check for Responses

```bash
usql ~/.otterassist/messages.db -c "
  SELECT id, role, substr(content, 1, 80) as preview, created_at
  FROM messages
  ORDER BY created_at DESC
  LIMIT 10
"
```

### Read a Full Message

```bash
usql ~/.otterassist/messages.db -c "SELECT content FROM messages WHERE id = '<ID>'"
```

### Continue a Conversation

```bash
# Reply to an agent message (use its ID as parent_id)
usql ~/.otterassist/messages.db -c "
  INSERT INTO messages (id, role, content, parent_id, status, created_at)
  VALUES (
    '$(uuidgen | tr 'A-Z' 'a-z')',
    'user',
    'Thanks! Can you also check the tests?',
    '<AGENT_MESSAGE_ID>',
    'unread',
    datetime('now')
  )
"
```

## Configuration

Add to `~/.otterassist/config.json`:

```json
{
  "extensions": {
    "messaging": {
      "enabled": true,
      "config": {
        "dbPath": "~/.otterassist/messages.db"
      }
    }
  }
}
```

## Helper Script (Optional)

Create `~/bin/msg` for convenience:

```bash
#!/bin/bash
DB="$HOME/.otterassist/messages.db"

case "$1" in
  send)
    shift
    usql "$DB" -c "
      INSERT INTO messages (id, role, content, parent_id, status, created_at)
      VALUES ('$(uuidgen | tr 'A-Z' 'a-z')', 'user', '$*', NULL, 'unread', datetime('now'))
    "
    echo "Message sent"
    ;;
  list)
    usql "$DB" -c "
      SELECT id, role, substr(content, 1, 60) as preview, status, created_at
      FROM messages ORDER BY created_at DESC LIMIT 20
    "
    ;;
  read)
    usql "$DB" -c "SELECT * FROM messages WHERE id = '$2'"
    ;;
  *)
    echo "Usage: msg send <message> | msg list | msg read <id>"
    ;;
esac
```

Then:

```bash
msg send "Please check the build logs"
msg list
msg read abc-123-def
```

## Requirements

- `usql` CLI tool installed (for querying the database)
- `uuidgen` for generating UUIDs (usually pre-installed)
