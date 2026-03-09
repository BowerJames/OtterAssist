/**
 * OtterAssist - AI agent that runs locally on your computer
 *
 * Event-driven architecture where events are queued and processed
 * by an AI agent on a scheduled basis.
 */

// Re-export CLI
export { parseArgs, runCli } from "./cli/index.ts";
export { loadConfig, saveConfig } from "./config/loader.ts";
// Re-export config
export { defaultConfig, validateConfig } from "./config/schema.ts";
export { SimpleEventEmitter } from "./core/emitter.ts";
// Re-export core components
export { ConsoleLogger, logger } from "./core/logger.ts";
export { Orchestrator } from "./core/orchestrator.ts";
export { SQLiteEventQueue } from "./core/queue.ts";
export { AgentRunner } from "./core/runner.ts";
export { Scheduler } from "./core/scheduler.ts";

// Re-export extension system
export {
  discoverExtensions,
  ExtensionManager,
  loadExtension,
} from "./extensions/index.ts";
// Re-export types
export * from "./types/index.ts";

// Main entry point
async function main(): Promise<void> {
  console.log("🦦 OtterAssist - AI Agent for your computer");
  console.log("Run 'otterassist --help' for usage information");
}

// Run main if this is the entry point
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
