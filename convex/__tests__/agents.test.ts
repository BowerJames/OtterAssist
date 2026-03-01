import { test, expect, describe, beforeEach } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import { api } from "../_generated/api.js";

const modules = {
  "../agents.ts": () => import("../agents.js"),
  "../_generated/api.js": () => import("../_generated/api.js"),
  "../_generated/server.js": () => import("../_generated/server.js"),
};

describe("Agents CRUD Operations", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
  });

  describe("createAgent", () => {
    test("should create a new agent with all required fields", async () => {
      const agentData = {
        name: "Test Agent",
        systemPrompt: "You are a helpful assistant",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: ["tool1", "tool2"],
        isActive: true,
      };

      const agentId = await t.mutation(api.agents.createAgent, agentData);

      expect(agentId).toBeDefined();
      expect(typeof agentId).toBe("string");
    });

    test("should create an inactive agent", async () => {
      const agentData = {
        name: "Inactive Agent",
        systemPrompt: "You are a test assistant",
        llmProvider: "anthropic",
        llmModel: "claude-3",
        tools: [],
        isActive: false,
      };

      const agentId = await t.mutation(api.agents.createAgent, agentData);
      const agent = await t.query(api.agents.getAgent, { agentId });

      expect(agent).toBeDefined();
      expect(agent?.isActive).toBe(false);
    });
  });

  describe("getAgent", () => {
    test("should retrieve an existing agent", async () => {
      const agentData = {
        name: "Get Test Agent",
        systemPrompt: "Test prompt",
        llmProvider: "openai",
        llmModel: "gpt-3.5-turbo",
        tools: ["test-tool"],
        isActive: true,
      };

      const agentId = await t.mutation(api.agents.createAgent, agentData);
      const agent = await t.query(api.agents.getAgent, { agentId });

      expect(agent).toBeDefined();
      expect(agent?.name).toBe(agentData.name);
      expect(agent?.systemPrompt).toBe(agentData.systemPrompt);
      expect(agent?.llmProvider).toBe(agentData.llmProvider);
      expect(agent?.llmModel).toBe(agentData.llmModel);
      expect(agent?.tools).toEqual(agentData.tools);
      expect(agent?.isActive).toBe(agentData.isActive);
    });

    test("should return null for non-existent agent", async () => {
      const agentId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("agents", {
          name: "Temporary",
          systemPrompt: "Temporary",
          llmProvider: "temp",
          llmModel: "temp",
          tools: [],
          isActive: false,
        });
        await ctx.db.delete(id);
        return id;
      });
      
      const agent = await t.query(api.agents.getAgent, { agentId });
      expect(agent).toBeNull();
    });
  });

  describe("listAgents", () => {
    test("should list all agents", async () => {
      await t.mutation(api.agents.createAgent, {
        name: "Agent 1",
        systemPrompt: "Prompt 1",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      await t.mutation(api.agents.createAgent, {
        name: "Agent 2",
        systemPrompt: "Prompt 2",
        llmProvider: "anthropic",
        llmModel: "claude-3",
        tools: [],
        isActive: false,
      });

      const agents = await t.query(api.agents.listAgents, {});

      expect(agents.length).toBe(2);
    });

    test("should filter agents by isActive status", async () => {
      await t.mutation(api.agents.createAgent, {
        name: "Active Agent",
        systemPrompt: "Active prompt",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      await t.mutation(api.agents.createAgent, {
        name: "Inactive Agent",
        systemPrompt: "Inactive prompt",
        llmProvider: "openai",
        llmModel: "gpt-3.5-turbo",
        tools: [],
        isActive: false,
      });

      const activeAgents = await t.query(api.agents.listAgents, { isActive: true });
      const inactiveAgents = await t.query(api.agents.listAgents, { isActive: false });

      expect(activeAgents.length).toBe(1);
      expect(activeAgents[0].name).toBe("Active Agent");
      
      expect(inactiveAgents.length).toBe(1);
      expect(inactiveAgents[0].name).toBe("Inactive Agent");
    });

    test("should return empty array when no agents exist", async () => {
      const agents = await t.query(api.agents.listAgents, {});
      expect(agents).toEqual([]);
    });
  });

  describe("updateAgent", () => {
    test("should update agent name", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "Original Name",
        systemPrompt: "Test prompt",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      await t.mutation(api.agents.updateAgent, {
        agentId,
        name: "Updated Name",
      });

      const agent = await t.query(api.agents.getAgent, { agentId });
      expect(agent?.name).toBe("Updated Name");
    });

    test("should update multiple fields", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "Original",
        systemPrompt: "Original prompt",
        llmProvider: "openai",
        llmModel: "gpt-3.5-turbo",
        tools: [],
        isActive: true,
      });

      await t.mutation(api.agents.updateAgent, {
        agentId,
        name: "Updated",
        systemPrompt: "Updated prompt",
        llmModel: "gpt-4",
        isActive: false,
        tools: ["new-tool"],
      });

      const agent = await t.query(api.agents.getAgent, { agentId });
      expect(agent?.name).toBe("Updated");
      expect(agent?.systemPrompt).toBe("Updated prompt");
      expect(agent?.llmModel).toBe("gpt-4");
      expect(agent?.isActive).toBe(false);
      expect(agent?.tools).toEqual(["new-tool"]);
    });

    test("should not modify unspecified fields", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "Test Agent",
        systemPrompt: "Test prompt",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: ["tool1"],
        isActive: true,
      });

      await t.mutation(api.agents.updateAgent, {
        agentId,
        name: "New Name",
      });

      const agent = await t.query(api.agents.getAgent, { agentId });
      expect(agent?.name).toBe("New Name");
      expect(agent?.systemPrompt).toBe("Test prompt");
      expect(agent?.llmProvider).toBe("openai");
      expect(agent?.llmModel).toBe("gpt-4");
      expect(agent?.tools).toEqual(["tool1"]);
      expect(agent?.isActive).toBe(true);
    });
  });

  describe("deleteAgent", () => {
    test("should delete an existing agent", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "To Delete",
        systemPrompt: "Delete me",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      await t.mutation(api.agents.deleteAgent, { agentId });

      const agent = await t.query(api.agents.getAgent, { agentId });
      expect(agent).toBeNull();
    });

    test("should remove agent from list after deletion", async () => {
      const agentId = await t.mutation(api.agents.createAgent, {
        name: "Agent to Delete",
        systemPrompt: "Test",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      await t.mutation(api.agents.createAgent, {
        name: "Agent to Keep",
        systemPrompt: "Test",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      let agents = await t.query(api.agents.listAgents, {});
      expect(agents.length).toBe(2);

      await t.mutation(api.agents.deleteAgent, { agentId });

      agents = await t.query(api.agents.listAgents, {});
      expect(agents.length).toBe(1);
      expect(agents[0].name).toBe("Agent to Keep");
    });
  });
});
