/**
 * CLI interface
 * @see Issue #9
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AgentRunner,
  type Config,
  ConsoleLogger,
  discoverExtensionInfo,
  type EventQueue,
  ExtensionManager,
  isFirstRun,
  type Logger,
  loadConfig,
  Orchestrator,
  runSetupWizard,
  Scheduler,
  SQLiteEventQueue,
} from "../index.ts";

/** Return type for initializeComponents */
interface Components {
  config: Config;
  logger: Logger;
  eventQueue: EventQueue;
  extensionManager: ExtensionManager;
  agentRunner: AgentRunner;
  orchestrator: Orchestrator;
  scheduler: Scheduler;
}

/**
 * CLI options parsed from command line arguments
 */
export interface CliOptions {
  setup: boolean;
  once: boolean;
  status: boolean;
  events: boolean;
  config?: string;
  help: boolean;
  version: boolean;
}

/**
 * Parses command line arguments and returns options
 */
export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    setup: false,
    once: false,
    status: false,
    events: false,
    config: undefined,
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--setup":
        options.setup = true;
        break;
      case "--once":
        options.once = true;
        break;
      case "--status":
        options.status = true;
        break;
      case "--events":
        options.events = true;
        break;
      case "--config":
      case "-c":
        options.config = args[++i];
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-v":
        options.version = true;
        break;
      default:
        // Unknown argument - could warn but ignore for now
        break;
    }
  }

  return options;
}

/**
 * Prints help text
 */
function printHelp(): void {
  console.log(`
🦦 OtterAssist - AI Agent for your computer

USAGE:
  otterassist [OPTIONS]

OPTIONS:
  --setup          Run the setup wizard to configure OtterAssist
  --once           Run one check immediately, then exit
  --status         Show current status
  --events         List pending events
  -c, --config     Specify config file path
  -h, --help       Show this help message
  -v, --version    Show version

EXAMPLES:
  otterassist              Start the daemon (foreground)
  otterassist --setup      Configure OtterAssist
  otterassist --once       Process events once and exit
`);
}

/**
 * Prints version from package.json
 */
function printVersion(): void {
  try {
    const packagePath = join(import.meta.dir, "..", "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
    console.log(`otterassist v${packageJson.version}`);
  } catch {
    console.log("otterassist v0.1.0");
  }
}

/**
 * Runs the setup wizard
 */
async function runSetup(): Promise<void> {
  console.log("🦦 OtterAssist Setup Wizard\n");

  // Discover extensions
  console.log("Discovering extensions...");
  const extensions = await discoverExtensionInfo();

  if (extensions.length > 0) {
    console.log(`Found ${extensions.length} extension(s):`);
    for (const ext of extensions) {
      console.log(`  • ${ext.name}: ${ext.description}`);
    }
  } else {
    console.log("No extensions found.");
    console.log(
      "Add extensions to ~/.otterassist/extensions/ to enable event sources.",
    );
  }
  console.log("");

  // Run the wizard
  const saved = await runSetupWizard(extensions);

  if (saved) {
    console.log("\n✅ Configuration saved to ~/.otterassist/config.json");
    console.log("Run 'otterassist' to start the daemon.");
  } else {
    console.log("\n❌ Setup cancelled.");
    process.exit(1);
  }
}

/**
 * Shows current status
 */
async function showStatus(): Promise<void> {
  const firstRun = await isFirstRun();

  if (firstRun) {
    console.log("🦦 OtterAssist Status: Not configured");
    console.log("Run 'otterassist --setup' to configure.");
    return;
  }

  const config = await loadConfig();
  console.log("🦦 OtterAssist Status");
  console.log(`  Poll interval: ${config.pollIntervalSeconds}s`);
  console.log("  Extensions:");
  for (const [name, { enabled }] of Object.entries(config.extensions)) {
    console.log(`    ${enabled ? "✓" : "✗"} ${name}`);
  }
}

/**
 * Lists pending events
 */
async function listEvents(): Promise<void> {
  const firstRun = await isFirstRun();

  if (firstRun) {
    console.log("🦦 OtterAssist is not configured.");
    console.log("Run 'otterassist --setup' first.");
    return;
  }

  const logger = new ConsoleLogger("info");
  const dbPath = join(homedir(), ".otterassist", "events.db");
  const eventQueue = await SQLiteEventQueue.create(dbPath, logger);

  try {
    const events = await eventQueue.getPending();

    if (events.length === 0) {
      console.log("🦦 No pending events");
      return;
    }

    console.log(`🦦 Pending Events (${events.length}):`);
    for (const event of events) {
      const created = event.createdAt.toLocaleString();
      const progress = event.progress ? ` - ${event.progress}` : "";
      console.log(`  • [${event.id.slice(0, 8)}...] ${event.message}`);
      console.log(`    Created: ${created}${progress}`);
    }
  } finally {
    eventQueue.close();
  }
}

/**
 * Initializes all components needed for the scheduler
 */
async function initializeComponents(): Promise<Components> {
  const config = await loadConfig();
  const logger = new ConsoleLogger("info");

  // Initialize event queue
  const dbPath = join(homedir(), ".otterassist", "events.db");
  const eventQueue = await SQLiteEventQueue.create(dbPath, logger);

  // Initialize extension manager
  const extensionManager = new ExtensionManager(config, logger);
  await extensionManager.loadAll();

  // Initialize agent runner
  const agentRunner = new AgentRunner({
    eventQueue,
    logger,
  });

  // Initialize orchestrator
  const orchestrator = new Orchestrator({
    eventQueue,
    agentRunner,
    logger,
  });

  // Initialize scheduler
  const scheduler = new Scheduler({
    pollIntervalSeconds: config.pollIntervalSeconds,
    extensionManager,
    eventQueue,
    orchestrator,
    logger,
  });

  return {
    config,
    logger,
    eventQueue,
    extensionManager,
    agentRunner,
    orchestrator,
    scheduler,
  };
}

/**
 * Runs a single check
 */
async function runOnce(): Promise<void> {
  const firstRun = await isFirstRun();

  if (firstRun) {
    console.log("🦦 OtterAssist is not configured.");
    console.log("Run 'otterassist --setup' first.");
    process.exit(1);
  }

  console.log("🦦 Running single check...");

  let components: Components | undefined;
  try {
    components = await initializeComponents();
    await components.scheduler.triggerNow();
    console.log("✅ Single check completed");
  } catch (error) {
    console.error("❌ Single check failed:", error);
    process.exit(1);
  } finally {
    if (components) {
      await components.extensionManager.shutdownAll();
      components.eventQueue.close();
    }
  }
}

/**
 * Runs the daemon
 */
async function runDaemon(): Promise<void> {
  const firstRun = await isFirstRun();

  if (firstRun) {
    console.log("🦦 Welcome to OtterAssist!");
    console.log("Run 'otterassist --setup' to get started.");
    process.exit(0);
  }

  let components: Components | undefined;
  try {
    components = await initializeComponents();
    const { config, scheduler, extensionManager, eventQueue } = components;

    console.log("🦦 OtterAssist daemon starting...");
    console.log(`  Poll interval: ${config.pollIntervalSeconds}s`);
    console.log(
      `  Extensions: ${extensionManager.getLoadedNames().join(", ") || "none"}`,
    );
    console.log("");
    console.log("Press Ctrl+C to stop.");

    // Handle graceful shutdown
    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log("\n🦦 Shutting down...");
      await scheduler.stop();
      await extensionManager.shutdownAll();
      eventQueue.close();
      console.log("🦦 Goodbye!");
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Start the scheduler
    scheduler.start();

    // Keep the process alive
    await new Promise(() => {}); // Never resolves
  } catch (error) {
    console.error("❌ Daemon failed to start:", error);
    process.exit(1);
  }
}

/**
 * Runs the CLI
 */
export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Handle help and version first
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    printVersion();
    process.exit(0);
  }

  // Handle setup
  if (options.setup) {
    await runSetup();
    process.exit(0);
  }

  // Handle status
  if (options.status) {
    await showStatus();
    process.exit(0);
  }

  // Handle events
  if (options.events) {
    await listEvents();
    process.exit(0);
  }

  // Handle once
  if (options.once) {
    await runOnce();
    process.exit(0);
  }

  // Default: start daemon
  await runDaemon();
}
