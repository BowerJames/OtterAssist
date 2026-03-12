/**
 * OtterAssist - AI agent that runs locally on your computer
 *
 * Event-driven architecture where events are queued and processed
 * by an AI agent on a scheduled basis.
 */

// Re-export builtins
export {
  BUILTIN_EXTENSIONS,
  contextThreshold,
  getOptionalExtensions,
  getRequiredExtensions,
  wrapUpManager,
  wrapUpState,
} from "./builtins/index.ts";
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
  ensureWrapUpPrompt,
  getWrapUpPrompt,
  getWrapUpPromptPath,
  type Runner,
  setWrapUpPrompt,
  WRAP_UP_PROMPT,
} from "./core/runner.ts";
export { Scheduler } from "./core/scheduler.ts";
// Re-export event management tools
export {
  createCompleteEventTool,
  createListEventsTool,
  createUpdateEventProgressTool,
} from "./core/tools/index.ts";
export type {
  EventSourceDefinition,
  EventSourceExtension,
  ExtensionConfigureContext,
  ExtensionContext,
  ExtensionFactory,
  OAExtensionContext,
  OtterAssistExtension,
  PiExtensionFunction,
} from "./extensions/index.ts";
// Re-export extension system
// Re-export extension installer
export {
  disableExtension,
  discoverExtensions,
  ExtensionManager,
  enableExtension,
  GLOBAL_EXTENSIONS_DIR,
  getInstalledExtension,
  type InstalledExtension,
  type InstallOptions,
  type InstallResult,
  installExtension,
  LOCAL_EXTENSIONS_DIR,
  type LoadedExtension,
  listInstalledExtensions,
  loadExtension,
  loadExtensionFromPath,
  uninstallExtension,
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
