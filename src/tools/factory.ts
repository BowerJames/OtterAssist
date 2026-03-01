import { ToolRegistry } from "./registry";
import { bashTool } from "./bash";
import { readFileTool, writeFileTool, listFilesTool } from "./file";
import {
  searchMessagesTool,
  listUnreadTool,
  getMessageTool,
  writeMessageTool,
  markReadTool,
} from "./convex";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(bashTool);
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(listFilesTool);
  registry.register(searchMessagesTool);
  registry.register(listUnreadTool);
  registry.register(getMessageTool);
  registry.register(writeMessageTool);
  registry.register(markReadTool);

  return registry;
}

export function createToolRegistryForTools(toolNames: string[]): ToolRegistry {
  const registry = new ToolRegistry();
  const allTools = {
    bash: bashTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    list_files: listFilesTool,
    search_messages: searchMessagesTool,
    list_unread: listUnreadTool,
    get_message: getMessageTool,
    write_message: writeMessageTool,
    mark_read: markReadTool,
  };

  for (const name of toolNames) {
    const tool = allTools[name as keyof typeof allTools];
    if (tool) {
      registry.register(tool);
    }
  }

  return registry;
}
