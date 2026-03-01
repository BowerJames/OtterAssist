export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface ToolParameters extends Record<string, unknown> {
  type: "object";
  properties: Record<string, ToolParameter>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolExecutionError {
  toolName: string;
  error: string;
}
