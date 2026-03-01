import { watch, type FSWatcher } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { getConvexUrl, getWorkspacePath } from "../tools/env";
import { minimatch } from "minimatch";

const DEFAULT_DEBOUNCE_MS = 100;
const DEFAULT_IGNORE_PATTERNS = [
  ".git/**",
  "node_modules/**",
  ".DS_Store",
  "**/*.swp",
  "**/*~",
  "**/.DS_Store",
];

interface FileTrigger {
  pattern: string;
  events: ("created" | "modified" | "deleted")[];
}

interface AgentWithTriggers {
  _id: Id<"agents">;
  name: string;
  fileTriggers?: FileTrigger[];
}

interface WatcherConfig {
  debounceMs?: number;
  ignorePatterns?: string[];
}

export type { WatcherConfig };

interface QueuedEvent {
  path: string;
  eventType: "created" | "modified" | "deleted";
  timestamp: number;
}

export class FileWatcher {
  private workspacePath: string;
  private convexClient: ConvexHttpClient;
  private watcher: FSWatcher | null = null;
  private running: boolean = false;
  private debounceMs: number;
  private ignorePatterns: string[];
  private debounceMap: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private agents: AgentWithTriggers[] = [];
  private agentRefreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: WatcherConfig) {
    this.workspacePath = getWorkspacePath();
    this.convexClient = new ConvexHttpClient(getConvexUrl());
    this.debounceMs = config?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.ignorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...(config?.ignorePatterns ?? [])];
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    await this.refreshAgents();

    this.agentRefreshInterval = setInterval(() => {
      this.refreshAgents().catch((error) => {
        console.error("Failed to refresh agents:", error);
      });
    }, 30000);

    this.watcher = watch(
      this.workspacePath,
      { recursive: true, persistent: true },
      (eventType, filename) => {
        this.handleFileEvent(eventType, filename).catch((error) => {
          console.error("File event handling error:", error);
        });
      }
    );

    this.watcher.on("error", (error) => {
      console.error("File watcher error:", error);
    });

    this.running = true;
  }

  stop(): void {
    this.running = false;

    if (this.agentRefreshInterval) {
      clearInterval(this.agentRefreshInterval);
      this.agentRefreshInterval = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const timeout of this.debounceMap.values()) {
      clearTimeout(timeout);
    }
    this.debounceMap.clear();
  }

  private async refreshAgents(): Promise<void> {
    try {
      const agents = await this.convexClient.query(api.agents.listAgentsWithFileTriggers, {});
      this.agents = agents as AgentWithTriggers[];
    } catch (error) {
      console.error("Failed to fetch agents with file triggers:", error);
    }
  }

  private async handleFileEvent(nodeEventType: string, filename: string | null): Promise<void> {
    if (!filename) {
      return;
    }

    const absolutePath = resolve(this.workspacePath, filename);
    const relativePath = relative(this.workspacePath, absolutePath);

    if (this.shouldIgnore(relativePath)) {
      return;
    }

    let eventType: "created" | "modified" | "deleted";
    if (nodeEventType === "rename") {
      eventType = "created";
    } else if (nodeEventType === "change") {
      eventType = "modified";
    } else {
      eventType = "modified";
    }

    this.debounceEvent(relativePath, eventType);
  }

  private shouldIgnore(relativePath: string): boolean {
    for (const pattern of this.ignorePatterns) {
      if (minimatch(relativePath, pattern, { dot: true })) {
        return true;
      }
    }
    return false;
  }

  private debounceEvent(relativePath: string, eventType: "created" | "modified" | "deleted"): void {
    const key = `${relativePath}:${eventType}`;

    const existing = this.debounceMap.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      this.debounceMap.delete(key);
      this.processFileEvent(relativePath, eventType).catch((error) => {
        console.error(`Failed to process file event for ${relativePath}:`, error);
      });
    }, this.debounceMs);

    this.debounceMap.set(key, timeout);
  }

  private async processFileEvent(relativePath: string, eventType: "created" | "modified" | "deleted"): Promise<void> {
    const matchingAgents = this.findMatchingAgents(relativePath, eventType);

    if (matchingAgents.length === 0) {
      return;
    }

    const queuePromises = matchingAgents.map((agent) =>
      this.queueEvent(agent._id, relativePath, eventType)
    );

    await Promise.all(queuePromises);
  }

  private findMatchingAgents(relativePath: string, eventType: "created" | "modified" | "deleted"): AgentWithTriggers[] {
    return this.agents.filter((agent) => {
      if (!agent.fileTriggers || agent.fileTriggers.length === 0) {
        return false;
      }

      return agent.fileTriggers.some((trigger) => {
        if (!trigger.events.includes(eventType)) {
          return false;
        }

        return minimatch(relativePath, trigger.pattern, { dot: true });
      });
    });
  }

  private async queueEvent(agentId: Id<"agents">, relativePath: string, eventType: "created" | "modified" | "deleted"): Promise<void> {
    const eventName = `file_${eventType}`;

    try {
      await this.convexClient.mutation(api.events.queueEvent, {
        type: eventName,
        agentId,
        payload: {
          path: relativePath,
          absolutePath: resolve(this.workspacePath, relativePath),
          eventType,
        },
      });
    } catch (error) {
      console.error(`Failed to queue event for agent ${agentId}:`, error);
    }
  }
}
