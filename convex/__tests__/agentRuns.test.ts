import { test, expect, describe, beforeEach } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../schema.js";
import { api } from "../_generated/api.js";

const modules = {
  "../agentRuns.ts": () => import("../agentRuns.js"),
  "../agents.ts": () => import("../agents.js"),
  "../_generated/api.js": () => import("../_generated/api.js"),
  "../_generated/server.js": () => import("../_generated/server.js"),
};

describe("AgentRuns CRUD Operations", () => {
  let t: ReturnType<typeof convexTest>;
  let agentId: any;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    agentId = await t.mutation(api.agents.createAgent, {
      name: "Test Agent",
      systemPrompt: "You are a helpful assistant",
      llmProvider: "openai",
      llmModel: "gpt-4",
      tools: [],
      isActive: true,
    });
  });

  describe("createRun", () => {
    test("should create a new run with required fields", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      expect(runId).toBeDefined();
      expect(typeof runId).toBe("string");
    });

    test("should create run with all optional fields", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "event",
        triggerData: { source: "webhook", payload: { test: true } },
        instructions: "Complete this task",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });

      expect(run).toBeDefined();
      expect(run?.triggerType).toBe("event");
      expect(run?.triggerData).toEqual({ source: "webhook", payload: { test: true } });
      expect(run?.instructions).toBe("Complete this task");
      expect(run?.status).toBe("pending");
      expect(run?.startedAt).toBeDefined();
    });

    test("should create scheduled run", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "scheduled",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });

      expect(run?.triggerType).toBe("scheduled");
      expect(run?.status).toBe("pending");
    });
  });

  describe("getRun", () => {
    test("should retrieve an existing run", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
        instructions: "Test instructions",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });

      expect(run).toBeDefined();
      expect(run?.agentId).toBe(agentId);
      expect(run?.triggerType).toBe("manual");
      expect(run?.instructions).toBe("Test instructions");
      expect(run?.status).toBe("pending");
    });

    test("should return null for non-existent run", async () => {
      const runId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("agentRuns", {
          agentId,
          triggerType: "manual",
          status: "pending",
          startedAt: Date.now(),
        });
        await ctx.db.delete(id);
        return id;
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run).toBeNull();
    });
  });

  describe("updateRunStatus", () => {
    test("should update status to running", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "running",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("running");
    });

    test("should update status to completed", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "running",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "completed",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("completed");
    });

    test("should update status to failed", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "running",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "failed",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("failed");
    });
  });

  describe("setRunError", () => {
    test("should set error and mark run as failed", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.setRunError, {
        runId,
        error: "Something went wrong",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("failed");
      expect(run?.error).toBe("Something went wrong");
      expect(run?.completedAt).toBeDefined();
    });
  });

  describe("setRunCompleted", () => {
    test("should mark run as completed with trajectory path", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.setRunCompleted, {
        runId,
        trajectoryPath: "/runs/123/trajectory.json",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("completed");
      expect(run?.trajectoryPath).toBe("/runs/123/trajectory.json");
      expect(run?.completedAt).toBeDefined();
    });

    test("should mark run as completed without trajectory path", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.setRunCompleted, {
        runId,
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("completed");
      expect(run?.trajectoryPath).toBeUndefined();
      expect(run?.completedAt).toBeDefined();
    });
  });

  describe("listRuns", () => {
    test("should list runs for an agent with pagination", async () => {
      await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "scheduled",
      });

      const result = await t.query(api.agentRuns.listRuns, {
        agentId,
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.length).toBe(2);
      expect(result.isDone).toBe(true);
    });

    test("should return empty page when no runs exist", async () => {
      const result = await t.query(api.agentRuns.listRuns, {
        agentId,
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    test("should only list runs for specified agent", async () => {
      const otherAgentId = await t.mutation(api.agents.createAgent, {
        name: "Other Agent",
        systemPrompt: "Test",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.createRun, {
        agentId: otherAgentId,
        triggerType: "manual",
      });

      const result = await t.query(api.agentRuns.listRuns, {
        agentId,
        paginationOpts: { numItems: 10, cursor: null },
      });

      expect(result.page.length).toBe(1);
      expect(result.page[0].agentId).toBe(agentId);
    });
  });

  describe("getActiveRun", () => {
    test("should return running run for agent", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "running",
      });

      const activeRun = await t.query(api.agentRuns.getActiveRun, { agentId });

      expect(activeRun).toBeDefined();
      expect(activeRun?._id).toBe(runId);
      expect(activeRun?.status).toBe("running");
    });

    test("should return null when no running run exists", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "completed",
      });

      const activeRun = await t.query(api.agentRuns.getActiveRun, { agentId });

      expect(activeRun).toBeNull();
    });

    test("should not return runs from other agents", async () => {
      const otherAgentId = await t.mutation(api.agents.createAgent, {
        name: "Other Agent",
        systemPrompt: "Test",
        llmProvider: "openai",
        llmModel: "gpt-4",
        tools: [],
        isActive: true,
      });

      const otherRunId = await t.mutation(api.agentRuns.createRun, {
        agentId: otherAgentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId: otherRunId,
        status: "running",
      });

      const activeRun = await t.query(api.agentRuns.getActiveRun, { agentId });

      expect(activeRun).toBeNull();
    });
  });

  describe("Status Transitions", () => {
    test("should track full lifecycle: pending -> running -> completed", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      let run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("pending");

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "running",
      });

      run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("running");

      await t.mutation(api.agentRuns.setRunCompleted, {
        runId,
        trajectoryPath: "/test/path",
      });

      run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("completed");
      expect(run?.trajectoryPath).toBe("/test/path");
      expect(run?.completedAt).toBeDefined();
    });

    test("should track failed lifecycle: pending -> running -> failed", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      await t.mutation(api.agentRuns.updateRunStatus, {
        runId,
        status: "running",
      });

      await t.mutation(api.agentRuns.setRunError, {
        runId,
        error: "Task failed",
      });

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.status).toBe("failed");
      expect(run?.error).toBe("Task failed");
      expect(run?.completedAt).toBeDefined();
    });
  });

  describe("Timestamps", () => {
    test("should set startedAt on creation", async () => {
      const before = Date.now();
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });
      const after = Date.now();

      const run = await t.query(api.agentRuns.getRun, { runId });

      expect(run?.startedAt).toBeGreaterThanOrEqual(before);
      expect(run?.startedAt).toBeLessThanOrEqual(after);
    });

    test("should set completedAt when run completes", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      let run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.completedAt).toBeUndefined();

      const before = Date.now();
      await t.mutation(api.agentRuns.setRunCompleted, { runId });
      const after = Date.now();

      run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.completedAt).toBeGreaterThanOrEqual(before);
      expect(run?.completedAt).toBeLessThanOrEqual(after);
    });

    test("should set completedAt when run fails", async () => {
      const runId = await t.mutation(api.agentRuns.createRun, {
        agentId,
        triggerType: "manual",
      });

      const before = Date.now();
      await t.mutation(api.agentRuns.setRunError, {
        runId,
        error: "Failed",
      });
      const after = Date.now();

      const run = await t.query(api.agentRuns.getRun, { runId });
      expect(run?.completedAt).toBeGreaterThanOrEqual(before);
      expect(run?.completedAt).toBeLessThanOrEqual(after);
    });
  });
});
