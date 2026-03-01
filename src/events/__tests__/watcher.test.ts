import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { FileWatcher } from "../watcher";

describe("FileWatcher", () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    process.env.OTTER_ASSIST_HOME = "/tmp/test_otter_assist";
    process.env.CONVEX_URL = "https://test.convex.cloud";
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
    }
    delete process.env.OTTER_ASSIST_HOME;
    delete process.env.CONVEX_URL;
  });

  describe("constructor", () => {
    test("should create watcher with default config", () => {
      watcher = new FileWatcher();
      expect(watcher).toBeDefined();
    });

    test("should create watcher with custom config", () => {
      watcher = new FileWatcher({
        debounceMs: 200,
        ignorePatterns: ["custom/**"],
      });
      expect(watcher).toBeDefined();
    });
  });

  describe("shouldIgnore", () => {
    test("should ignore .git files", () => {
      watcher = new FileWatcher();
      
      expect((watcher as any).shouldIgnore(".git/config")).toBe(true);
      expect((watcher as any).shouldIgnore(".git/objects/abc")).toBe(true);
    });

    test("should ignore node_modules", () => {
      watcher = new FileWatcher();
      
      expect((watcher as any).shouldIgnore("node_modules/package/index.js")).toBe(true);
    });

    test("should ignore .DS_Store", () => {
      watcher = new FileWatcher();
      
      expect((watcher as any).shouldIgnore(".DS_Store")).toBe(true);
      expect((watcher as any).shouldIgnore("subdir/.DS_Store")).toBe(true);
    });

    test("should ignore swap files", () => {
      watcher = new FileWatcher();
      
      expect((watcher as any).shouldIgnore("file.ts.swp")).toBe(true);
      expect((watcher as any).shouldIgnore("file.ts~")).toBe(true);
    });

    test("should not ignore regular files", () => {
      watcher = new FileWatcher();
      
      expect((watcher as any).shouldIgnore("src/index.ts")).toBe(false);
      expect((watcher as any).shouldIgnore("README.md")).toBe(false);
      expect((watcher as any).shouldIgnore("inbox/task.md")).toBe(false);
    });

    test("should respect custom ignore patterns", () => {
      watcher = new FileWatcher({
        ignorePatterns: ["custom/**", "*.log"],
      });
      
      expect((watcher as any).shouldIgnore("custom/file.txt")).toBe(true);
      expect((watcher as any).shouldIgnore("app.log")).toBe(true);
      expect((watcher as any).shouldIgnore("other/file.txt")).toBe(false);
    });
  });

  describe("findMatchingAgents", () => {
    test("should find matching agent for pattern", () => {
      watcher = new FileWatcher();
      
      (watcher as any).agents = [
        {
          _id: "agent1",
          name: "Test Agent",
          fileTriggers: [
            {
              pattern: "inbox/**",
              events: ["created"],
            },
          ],
        },
      ];

      const matches = (watcher as any).findMatchingAgents("inbox/task.md", "created");
      
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe("Test Agent");
    });

    test("should not match agent with different event type", () => {
      watcher = new FileWatcher();
      
      (watcher as any).agents = [
        {
          _id: "agent1",
          name: "Test Agent",
          fileTriggers: [
            {
              pattern: "inbox/**",
              events: ["created"],
            },
          ],
        },
      ];

      const matches = (watcher as any).findMatchingAgents("inbox/task.md", "modified");
      
      expect(matches.length).toBe(0);
    });

    test("should match multiple agents", () => {
      watcher = new FileWatcher();
      
      (watcher as any).agents = [
        {
          _id: "agent1",
          name: "Agent 1",
          fileTriggers: [
            {
              pattern: "**/*.md",
              events: ["created", "modified"],
            },
          ],
        },
        {
          _id: "agent2",
          name: "Agent 2",
          fileTriggers: [
            {
              pattern: "inbox/**",
              events: ["created"],
            },
          ],
        },
      ];

      const matches = (watcher as any).findMatchingAgents("inbox/task.md", "created");
      
      expect(matches.length).toBe(2);
    });

    test("should match agents with multiple trigger patterns", () => {
      watcher = new FileWatcher();
      
      (watcher as any).agents = [
        {
          _id: "agent1",
          name: "Multi Agent",
          fileTriggers: [
            {
              pattern: "src/**",
              events: ["modified"],
            },
            {
              pattern: "config/**",
              events: ["created", "modified"],
            },
          ],
        },
      ];

      expect((watcher as any).findMatchingAgents("src/index.ts", "modified").length).toBe(1);
      expect((watcher as any).findMatchingAgents("config/settings.json", "created").length).toBe(1);
      expect((watcher as any).findMatchingAgents("other/file.txt", "modified").length).toBe(0);
    });

    test("should not match agent without file triggers", () => {
      watcher = new FileWatcher();
      
      (watcher as any).agents = [
        {
          _id: "agent1",
          name: "No Triggers Agent",
        },
      ];

      const matches = (watcher as any).findMatchingAgents("inbox/task.md", "created");
      
      expect(matches.length).toBe(0);
    });

    test("should not match agent with empty file triggers", () => {
      watcher = new FileWatcher();
      
      (watcher as any).agents = [
        {
          _id: "agent1",
          name: "Empty Triggers Agent",
          fileTriggers: [],
        },
      ];

      const matches = (watcher as any).findMatchingAgents("inbox/task.md", "created");
      
      expect(matches.length).toBe(0);
    });
  });

  describe("start/stop", () => {
    test("should start and stop watcher", async () => {
      const { mkdirSync, existsSync } = await import("node:fs");
      const workspacePath = "/tmp/test_otter_assist_workspace";
      
      if (!existsSync(workspacePath)) {
        mkdirSync(workspacePath, { recursive: true });
      }
      
      const originalEnv = process.env.OTTER_ASSIST_HOME;
      process.env.OTTER_ASSIST_HOME = "/tmp/test_otter_assist_start";
      
      if (!existsSync("/tmp/test_otter_assist_start/workspace")) {
        mkdirSync("/tmp/test_otter_assist_start/workspace", { recursive: true });
      }
      
      watcher = new FileWatcher();
      
      try {
        await watcher.start();
        expect(watcher).toBeDefined();
        
        watcher.stop();
        expect(watcher).toBeDefined();
      } finally {
        process.env.OTTER_ASSIST_HOME = originalEnv;
      }
    });

    test("should not start twice", async () => {
      const { mkdirSync, existsSync } = await import("node:fs");
      
      const originalEnv = process.env.OTTER_ASSIST_HOME;
      process.env.OTTER_ASSIST_HOME = "/tmp/test_otter_assist_double";
      
      if (!existsSync("/tmp/test_otter_assist_double/workspace")) {
        mkdirSync("/tmp/test_otter_assist_double/workspace", { recursive: true });
      }
      
      watcher = new FileWatcher();
      
      try {
        await watcher.start();
        await watcher.start();
        
        watcher.stop();
      } finally {
        process.env.OTTER_ASSIST_HOME = originalEnv;
      }
    });
  });
});
