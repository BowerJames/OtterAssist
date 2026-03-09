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
export {
  Orchestrator,
  type OrchestratorOptions,
  type OrchestratorRunResult,
  type OrchestratorStatus,
} from "./core/orchestrator.ts";
export { SQLiteEventQueue } from "./core/queue.ts";
export {
  AgentRunner,
  type AgentRunnerOptions,
  type AgentRunResult,
  DEFAULT_AGENT_DIR,
  type Runner,
} from "./core/runner.ts";
export { Scheduler } from "./core/scheduler.ts";

// Re-export event management tools
export {
  createCompleteEventTool,
  createListEventsTool,
  createUpdateEventProgressTool,
} from "./core/tools/index.ts";

// Re-export extension system
export {
  discoverExtensions,
  ExtensionManager,
  GLOBAL_EXTENSIONS_DIR,
  type LoadedExtension,
  loadExtension,
  LOCAL_EXTENSIONS_DIR,
} from "./extensions/index.ts";
export type {
  EventSourceDefinition,
  EventSourceExtension,
  ExtensionContext,
  OAExtensionContext,
  OtterAssistExtension,
  PiExtensionFunction,
} from "./extensions/index.ts";
// Re-export setup wizard
export {
  defaultTheme,
  discoverExtensionInfo,
  type ExtensionInfo,
  isFirstRun,
  runSetupIfNeeded,
  runSetupWizard,
  type ScreenComponent,
  type ScreenFactory,
  type ScreenResult,
  SetupWizard,
  type WizardState,
  type WizardTheme,
} from "./setup/index.ts";
// Re-export types
export * from "./types/index.ts";

// Main entry point
async function main(): Promise<void> {
  const { runCli } = await import("./cli/index.ts");
  await runCli();
}

// Run main if this is the entry point
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
