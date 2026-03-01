import { homedir } from "node:os";
import { resolve, normalize } from "node:path";
import { mkdir } from "node:fs/promises";

const OTTER_ASSIST_HOME_ENV = "OTTER_ASSIST_HOME";
const DEFAULT_HOME_NAME = ".otter_assist";
const CONVEX_URL_ENV = "CONVEX_URL";

export function getConvexUrl(): string {
  const url = process.env[CONVEX_URL_ENV];
  if (!url) {
    throw new Error("CONVEX_URL environment variable is not set");
  }
  return url;
}

export function getOtterAssistHome(): string {
  const envHome = process.env[OTTER_ASSIST_HOME_ENV];
  if (envHome) {
    return resolve(envHome);
  }
  return resolve(homedir(), DEFAULT_HOME_NAME);
}

export function getWorkspacePath(subpath?: string): string {
  const home = getOtterAssistHome();
  const workspace = resolve(home, "workspace");
  if (!subpath) {
    return workspace;
  }
  return resolve(workspace, subpath);
}

export function isPathWithinWorkspace(path: string): boolean {
  const workspace = getWorkspacePath();
  const resolved = resolve(path);
  return resolved.startsWith(workspace + "/") || resolved === workspace;
}

export function validateWorkspacePath(subpath: string): string {
  const workspace = getWorkspacePath();
  const resolved = resolve(workspace, subpath);
  const normalized = normalize(resolved);

  if (!normalized.startsWith(workspace)) {
    throw new Error(`Path traversal detected: "${subpath}" escapes workspace`);
  }

  return normalized;
}

export interface OtterAssistConfig {
  llmProvider?: "openai" | "anthropic" | "zai-coding-plan";
  llmModel?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  eventPollIntervalMs?: number;
  fileWatcherDebounceMs?: number;
}

const DEFAULT_CONFIG: OtterAssistConfig = {
  llmProvider: "openai",
  llmModel: "gpt-4o",
  logLevel: "info",
  eventPollIntervalMs: 1000,
  fileWatcherDebounceMs: 100,
};

export function getConfigPath(): string {
  return resolve(getOtterAssistHome(), "config.json");
}

export function getLogsPath(subpath?: string): string {
  const home = getOtterAssistHome();
  const logs = resolve(home, "logs");
  if (!subpath) {
    return logs;
  }
  return resolve(logs, subpath);
}

export function getTrajectoriesPath(): string {
  return getLogsPath("trajectories");
}

export async function ensureDirectories(): Promise<void> {
  const dirs = [
    getOtterAssistHome(),
    getWorkspacePath(),
    getLogsPath(),
    getTrajectoriesPath(),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
}

export async function loadConfig(): Promise<OtterAssistConfig> {
  const configPath = getConfigPath();

  try {
    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      return { ...DEFAULT_CONFIG };
    }
    const content = await file.json();
    return { ...DEFAULT_CONFIG, ...content };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: OtterAssistConfig): Promise<void> {
  const configPath = getConfigPath();
  await ensureDirectories();
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}

export async function ensureConfig(): Promise<OtterAssistConfig> {
  await ensureDirectories();
  const configPath = getConfigPath();
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    await saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  return loadConfig();
}
