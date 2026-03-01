import { test, expect, describe } from "bun:test";
import {
  BASE_SYSTEM_PROMPT,
  buildWebhookTriggerPrompt,
  buildScheduledTriggerPrompt,
  buildFileChangeTriggerPrompt,
  buildManualTriggerPrompt,
  buildTriggerInstructions,
  buildFullPrompt,
} from "../prompts";
import type { TriggerContext } from "../types";

describe("BASE_SYSTEM_PROMPT", () => {
  test("contains essential sections", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("Your Role");
    expect(BASE_SYSTEM_PROMPT).toContain("Available Tools");
    expect(BASE_SYSTEM_PROMPT).toContain("Tool Usage Guidelines");
    expect(BASE_SYSTEM_PROMPT).toContain("Message Search");
    expect(BASE_SYSTEM_PROMPT).toContain("Response Format");
    expect(BASE_SYSTEM_PROMPT).toContain("Important Rules");
  });

  test("mentions tool names", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("readFile");
    expect(BASE_SYSTEM_PROMPT).toContain("writeFile");
    expect(BASE_SYSTEM_PROMPT).toContain("bash");
    expect(BASE_SYSTEM_PROMPT).toContain("searchMessages");
  });
});

describe("buildWebhookTriggerPrompt", () => {
  test("builds prompt with source only", () => {
    const prompt = buildWebhookTriggerPrompt("github");

    expect(prompt).toContain("webhook from **github**");
    expect(prompt).toContain("Analyze this webhook");
  });

  test("builds prompt with payload", () => {
    const prompt = buildWebhookTriggerPrompt("stripe", {
      event: "payment_completed",
      amount: 1000,
    });

    expect(prompt).toContain("webhook from **stripe**");
    expect(prompt).toContain("payment_completed");
    expect(prompt).toContain("1000");
    expect(prompt).toContain("```json");
  });

  test("handles empty payload", () => {
    const prompt = buildWebhookTriggerPrompt("slack", {});

    expect(prompt).toContain("webhook from **slack**");
    expect(prompt).not.toContain("```json");
  });
});

describe("buildScheduledTriggerPrompt", () => {
  test("builds prompt with name only", () => {
    const prompt = buildScheduledTriggerPrompt("daily-cleanup");

    expect(prompt).toContain('Scheduled task **"daily-cleanup"**');
    expect(prompt).toContain("has triggered");
  });

  test("builds prompt with schedule", () => {
    const prompt = buildScheduledTriggerPrompt("hourly-sync", "0 * * * *");

    expect(prompt).toContain("hourly-sync");
    expect(prompt).toContain("Schedule: 0 * * * *");
  });
});

describe("buildFileChangeTriggerPrompt", () => {
  test("builds prompt for created file", () => {
    const prompt = buildFileChangeTriggerPrompt("src/index.ts", "created");

    expect(prompt).toContain("src/index.ts");
    expect(prompt).toContain("was created");
  });

  test("builds prompt for modified file", () => {
    const prompt = buildFileChangeTriggerPrompt("config.json", "modified");

    expect(prompt).toContain("config.json");
    expect(prompt).toContain("was modified");
  });

  test("builds prompt for deleted file", () => {
    const prompt = buildFileChangeTriggerPrompt("old-file.txt", "deleted");

    expect(prompt).toContain("old-file.txt");
    expect(prompt).toContain("was deleted");
  });
});

describe("buildManualTriggerPrompt", () => {
  test("returns custom instructions when provided", () => {
    const instructions = "Please analyze the codebase and suggest improvements.";
    const prompt = buildManualTriggerPrompt(instructions);

    expect(prompt).toBe(instructions);
  });

  test("returns default message when no instructions", () => {
    const prompt = buildManualTriggerPrompt();

    expect(prompt).toContain("manual execution");
    expect(prompt).toContain("Wait for user instructions");
  });
});

describe("buildTriggerInstructions", () => {
  test("builds webhook trigger instructions", () => {
    const context: TriggerContext = {
      type: "webhook",
      source: "github",
      payload: { action: "push" },
    };

    const instructions = buildTriggerInstructions(context);

    expect(instructions).toContain("webhook from **github**");
  });

  test("builds scheduled trigger instructions", () => {
    const context: TriggerContext = {
      type: "scheduled",
      name: "daily-task",
    };

    const instructions = buildTriggerInstructions(context);

    expect(instructions).toContain("daily-task");
  });

  test("builds file change trigger instructions", () => {
    const context: TriggerContext = {
      type: "file_change",
      path: "/workspace/file.ts",
      action: "modified",
    };

    const instructions = buildTriggerInstructions(context);

    expect(instructions).toContain("/workspace/file.ts");
    expect(instructions).toContain("was modified");
  });

  test("builds manual trigger instructions", () => {
    const context: TriggerContext = {
      type: "manual",
      customInstructions: "Do something",
    };

    const instructions = buildTriggerInstructions(context);

    expect(instructions).toBe("Do something");
  });
});

describe("buildFullPrompt", () => {
  test("combines base prompt and trigger instructions", () => {
    const base = "You are an assistant.";
    const trigger = "A webhook was received.";

    const full = buildFullPrompt(base, trigger);

    expect(full).toContain("You are an assistant.");
    expect(full).toContain("## Current Task");
    expect(full).toContain("A webhook was received.");
  });

  test("includes additional context when provided", () => {
    const base = "Base prompt";
    const trigger = "Trigger instructions";
    const context = "Additional context here";

    const full = buildFullPrompt(base, trigger, context);

    expect(full).toContain("## Additional Context");
    expect(full).toContain("Additional context here");
  });

  test("omits additional context section when not provided", () => {
    const base = "Base prompt";
    const trigger = "Trigger instructions";

    const full = buildFullPrompt(base, trigger);

    expect(full).not.toContain("## Additional Context");
  });
});
