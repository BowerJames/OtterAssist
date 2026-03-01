import { resolve, dirname } from "node:path";
import type { TrajectoryEntry } from "./types";
import { getOtterAssistHome } from "../tools/env";

function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTrajectoryDir(): string {
  const home = getOtterAssistHome();
  const datePath = getDatePath();
  return resolve(home, "logs", "trajectories", datePath);
}

export class TrajectoryLogger {
  private agentRunId: string;
  private filePath: string;
  private entries: TrajectoryEntry[];
  private finalized: boolean;

  constructor(agentRunId: string, logsDir?: string) {
    this.agentRunId = agentRunId;
    this.entries = [];
    this.finalized = false;

    const baseDir = logsDir ?? getTrajectoryDir();
    this.filePath = resolve(baseDir, `run_${agentRunId}.jsonl`);
  }

  getFilePath(): string {
    return this.filePath;
  }

  async log(entry: TrajectoryEntry): Promise<void> {
    if (this.finalized) {
      throw new Error("Cannot log to a finalized trajectory");
    }

    this.entries.push(entry);
    await this.persistEntries();
  }

  logSync(entry: TrajectoryEntry): void {
    if (this.finalized) {
      throw new Error("Cannot log to a finalized trajectory");
    }

    this.entries.push(entry);
  }

  private async persistEntries(): Promise<void> {
    const dir = dirname(this.filePath);

    try {
      await Bun.$`mkdir -p ${dir}`.quiet();
    } catch {
      // Directory might already exist
    }

    const lines = this.entries.map((entry) => JSON.stringify(entry)).join("\n");
    await Bun.write(this.filePath, lines + "\n");
  }

  async finalize(): Promise<string> {
    if (this.finalized) {
      return this.filePath;
    }

    await this.persistEntries();
    this.finalized = true;

    return this.filePath;
  }

  getEntries(): TrajectoryEntry[] {
    return [...this.entries];
  }

  isFinalized(): boolean {
    return this.finalized;
  }
}

export async function readTrajectory(filePath: string): Promise<TrajectoryEntry[]> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new Error(`Trajectory file not found: ${filePath}`);
  }

  const content = await file.text();
  const lines = content.trim().split("\n");

  return lines.map((line) => JSON.parse(line) as TrajectoryEntry);
}
