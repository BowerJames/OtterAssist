# OtterAssist

AI agentic framework built with Bun, Convex, and TypeScript.

## Setup

```bash
bun install
bun run setup
```

## Development

```bash
bun run typecheck  # Type check
bun run convex     # Start Convex dev
bun run dev        # Start service
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `OTTER_ASSIST_HOME` - Data directory (default: `~/.otter_assist`)
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
