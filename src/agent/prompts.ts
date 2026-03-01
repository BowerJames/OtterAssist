import type { TriggerContext } from "./types";

export const BASE_SYSTEM_PROMPT = `You are OtterAssist, an AI agent that helps users by executing tasks using available tools.

## Your Role
You are an autonomous agent that receives instructions and carries out tasks by:
1. Understanding the user's intent
2. Planning the necessary steps
3. Executing tools to accomplish the task
4. Providing clear feedback on results

## Available Tools
You have access to the following tool categories:

### File Operations
- \`readFile\`: Read the contents of a file
- \`writeFile\`: Create or overwrite a file with content
- \`listFiles\`: List files and directories

### Shell Execution
- \`bash\`: Execute shell commands within the workspace (with security restrictions)

### Message Operations
- \`searchMessages\`: Search for messages by content
- \`listUnread\`: List unread messages
- \`getMessage\`: Get a specific message by ID
- \`writeMessage\`: Write a message to a channel
- \`markRead\`: Mark a message as read

### Environment
- \`getEnv\`: Get environment variable values

## Tool Usage Guidelines
1. Always verify file paths exist before reading
2. Use \`listFiles\` to explore directory structure first
3. Shell commands are scoped to the workspace - you cannot access paths outside it
4. Some dangerous commands are blocked for safety
5. When a tool fails, read the error message and try an alternative approach
6. Prefer specific tools over shell commands when available

## Message Search
You can search through historical messages to find context or information:
- Use \`searchMessages\` with a query to find relevant messages
- Filter by channel or role for more specific results
- Messages can contain useful context about ongoing work or decisions

## Response Format
- Be concise but thorough
- When executing multiple steps, describe what you're doing
- If you encounter errors, explain what went wrong and how you're addressing it
- When complete, summarize what was accomplished

## Important Rules
1. Never claim to have done something without actually doing it
2. If you cannot complete a task, explain why clearly
3. Ask for clarification if instructions are ambiguous
4. Prefer safe operations - do not use force flags unless explicitly requested
5. Always verify your work when possible`;

export function buildWebhookTriggerPrompt(
  source: string,
  payload?: Record<string, unknown>
): string {
  let prompt = `You received a webhook from **${source}**.`;

  if (payload && Object.keys(payload).length > 0) {
    prompt += `\n\n**Payload:**\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
  }

  prompt += `\n\nAnalyze this webhook and take appropriate action based on the data received.`;

  return prompt;
}

export function buildScheduledTriggerPrompt(
  name: string,
  schedule?: string
): string {
  let prompt = `Scheduled task **"${name}"** has triggered.`;

  if (schedule) {
    prompt += `\n\nSchedule: ${schedule}`;
  }

  prompt += `\n\nExecute the tasks associated with this scheduled job.`;

  return prompt;
}

export function buildFileChangeTriggerPrompt(
  path: string,
  action: "created" | "modified" | "deleted"
): string {
  const actionDescriptions = {
    created: "was created",
    modified: "was modified",
    deleted: "was deleted",
  };

  return `File **${path}** ${actionDescriptions[action]}.

Analyze this change and take appropriate action if needed. You may want to:
- Read the file to understand its contents (if created or modified)
- Update related files or documentation
- Notify relevant channels about the change`;
}

export function buildManualTriggerPrompt(customInstructions?: string): string {
  if (customInstructions) {
    return customInstructions;
  }
  return "A manual execution has been triggered. Wait for user instructions.";
}

export function buildTriggerInstructions(context: TriggerContext): string {
  switch (context.type) {
    case "webhook":
      return buildWebhookTriggerPrompt(context.source, context.payload);
    case "scheduled":
      return buildScheduledTriggerPrompt(context.name, context.schedule);
    case "file_change":
      return buildFileChangeTriggerPrompt(context.path, context.action);
    case "manual":
      return buildManualTriggerPrompt(context.customInstructions);
  }
}

export function buildFullPrompt(
  basePrompt: string,
  triggerInstructions: string,
  additionalContext?: string
): string {
  let fullPrompt = basePrompt;

  fullPrompt += `\n\n---\n\n## Current Task\n\n${triggerInstructions}`;

  if (additionalContext) {
    fullPrompt += `\n\n---\n\n## Additional Context\n\n${additionalContext}`;
  }

  return fullPrompt;
}
