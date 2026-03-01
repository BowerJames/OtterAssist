import { homedir } from "node:os";
import { resolve, normalize } from "node:path";

const OTTER_ASSIST_HOME_ENV = "OTTER_ASSIST_HOME";
const DEFAULT_HOME_NAME = ".otter_assist";

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
