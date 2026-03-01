import { test, expect, describe } from "bun:test";
import { ToolRegistry } from "../registry";
import type { Tool, ToolResult } from "../types";

describe("ToolRegistry", () => {
  const createMockTool = (): Tool => ({
    name: "test_tool",
    description: "A test tool",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message to process",
        },
      },
      required: ["message"],
    },
    execute: async (args): Promise<ToolResult> => {
      return {
        success: true,
        output: `Processed: ${args.message}`,
      };
    },
  });

  describe("register", () => {
    test("registers a tool successfully", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      expect(() => registry.register(mockTool)).not.toThrow();
      expect(registry.has("test_tool")).toBe(true);
    });

    test("throws error when registering duplicate tool", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      expect(() => registry.register(mockTool)).toThrow(
        'Tool "test_tool" is already registered'
      );
    });

    test("stores tool correctly", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      const retrieved = registry.get("test_tool");
      expect(retrieved).toEqual(mockTool);
    });
  });

  describe("get", () => {
    test("returns undefined for non-existent tool", () => {
      const registry = new ToolRegistry();
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    test("returns registered tool", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      const tool = registry.get("test_tool");
      expect(tool).toBeDefined();
      expect(tool?.name).toBe("test_tool");
    });
  });

  describe("list", () => {
    test("returns empty array when no tools registered", () => {
      const registry = new ToolRegistry();
      expect(registry.list()).toEqual([]);
    });

    test("returns all registered tools", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      const tool2: Tool = {
        name: "test_tool_2",
        description: "Another test tool",
        parameters: {
          type: "object",
          properties: {
            value: {
              type: "number",
              description: "A number value",
            },
          },
        },
        execute: async (): Promise<ToolResult> => {
          return { success: true, output: "ok" };
        },
      };

      registry.register(mockTool);
      registry.register(tool2);

      const tools = registry.list();
      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain("test_tool");
      expect(tools.map((t) => t.name)).toContain("test_tool_2");
    });
  });

  describe("listNames", () => {
    test("returns empty array when no tools registered", () => {
      const registry = new ToolRegistry();
      expect(registry.listNames()).toEqual([]);
    });

    test("returns names of all registered tools", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      expect(registry.listNames()).toEqual(["test_tool"]);
    });
  });

  describe("has", () => {
    test("returns false for non-existent tool", () => {
      const registry = new ToolRegistry();
      expect(registry.has("nonexistent")).toBe(false);
    });

    test("returns true for registered tool", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      expect(registry.has("test_tool")).toBe(true);
    });
  });

  describe("getDefinitions", () => {
    test("returns empty array when no tools registered", () => {
      const registry = new ToolRegistry();
      const definitions = registry.getDefinitions();
      expect(definitions).toEqual([]);
    });

    test("returns LLMTool-compatible definitions", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      const definitions = registry.getDefinitions();

      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toEqual({
        name: "test_tool",
        description: "A test tool",
        parameters: mockTool.parameters,
      });
    });

    test("handles multiple tools", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      const tool2: Tool = {
        name: "another_tool",
        description: "Another tool",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (): Promise<ToolResult> => {
          return { success: true };
        },
      };

      registry.register(mockTool);
      registry.register(tool2);

      const definitions = registry.getDefinitions();
      expect(definitions).toHaveLength(2);
      expect(definitions.map((d) => d.name)).toContain("test_tool");
      expect(definitions.map((d) => d.name)).toContain("another_tool");
    });
  });

  describe("execute", () => {
    test("returns error for non-existent tool", async () => {
      const registry = new ToolRegistry();
      const result = await registry.execute("nonexistent", { message: "test" });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool "nonexistent" not found');
    });

    test("executes tool successfully", async () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      const result = await registry.execute("test_tool", {
        message: "Hello, world!",
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe("Processed: Hello, world!");
    });

    test("handles tool execution errors", async () => {
      const registry = new ToolRegistry();
      const errorTool: Tool = {
        name: "error_tool",
        description: "A tool that throws",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (): Promise<ToolResult> => {
          throw new Error("Something went wrong");
        },
      };

      registry.register(errorTool);
      const result = await registry.execute("error_tool", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool "error_tool" execution failed');
      expect(result.error).toContain("Something went wrong");
    });

    test("passes arguments to tool execute function", async () => {
      const registry = new ToolRegistry();
      let receivedArgs: Record<string, unknown> | undefined;

      const argTool: Tool = {
        name: "arg_tool",
        description: "Tool to test arguments",
        parameters: {
          type: "object",
          properties: {
            value: {
              type: "number",
              description: "A number",
            },
            flag: {
              type: "boolean",
              description: "A flag",
            },
          },
          required: ["value", "flag"],
        },
        execute: async (args): Promise<ToolResult> => {
          receivedArgs = args;
          return { success: true, output: "ok" };
        },
      };

      registry.register(argTool);
      await registry.execute("arg_tool", {
        value: 42,
        flag: true,
      });

      expect(receivedArgs).toEqual({
        value: 42,
        flag: true,
      });
    });

    test("handles non-Error exceptions", async () => {
      const registry = new ToolRegistry();
      const exceptionTool: Tool = {
        name: "exception_tool",
        description: "Tool that throws string",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (): Promise<ToolResult> => {
          throw "String error";
        },
      };

      registry.register(exceptionTool);
      const result = await registry.execute("exception_tool", {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown error occurred");
    });
  });

  describe("clear", () => {
    test("removes all registered tools", () => {
      const registry = new ToolRegistry();
      const mockTool = createMockTool();
      registry.register(mockTool);
      expect(registry.has("test_tool")).toBe(true);

      registry.clear();
      expect(registry.has("test_tool")).toBe(false);
      expect(registry.list()).toEqual([]);
      expect(registry.listNames()).toEqual([]);
    });
  });
});
