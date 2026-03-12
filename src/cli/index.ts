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
  DEFAULT_AGENT_DIR,
  disableExtension,
  discoverExtensionInfo,
  type EventQueue,
  ExtensionManager,
  enableExtension,
  getInstalledExtension,
  getWrapUpPrompt,
  type InstallOptions,
  installExtension,
  isFirstRun,
  type Logger,
  listInstalledExtensions,
  loadConfig,
  Orchestrator,
  runSetupWizard,
  Scheduler,
  SQLiteEventQueue,
  setWrapUpPrompt,
  uninstallExtension,
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
  // Extension installer commands
  install?: string;
  installLink: boolean;
  installForce: boolean;
  installNoEnable: boolean;
  uninstall?: string;
  extensionsList: boolean;
  extensionShow?: string;
  extensionConfigure?: string;
  enable?: string;
  disable?: string;
  // Built-ins wrap-up command
  builtinsWrapUp: boolean;
  builtinsWrapUpSet: boolean;
  builtinsWrapUpMessage?: string;
  builtinsWrapUpFile?: string;
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
    install: undefined,
    installLink: false,
    installForce: false,
    installNoEnable: false,
    uninstall: undefined,
    extensionsList: false,
    extensionShow: undefined,
    extensionConfigure: undefined,
    enable: undefined,
    disable: undefined,
    builtinsWrapUp: false,
    builtinsWrapUpSet: false,
    builtinsWrapUpMessage: undefined,
    builtinsWrapUpFile: undefined,
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
      case "--link":
        options.installLink = true;
        break;
      case "--force":
        options.installForce = true;
        break;
      case "--no-enable":
        options.installNoEnable = true;
        break;
      case "install":
        options.install = args[++i];
        break;
      case "uninstall":
        options.uninstall = args[++i];
        break;
      case "extensions":
      case "list":
        // Check next arg for subcommand
        {
          const nextArg = args[i + 1];
          if (nextArg && !nextArg.startsWith("-")) {
            if (nextArg === "list") {
              options.extensionsList = true;
              i++;
            } else if (nextArg === "show" && args[i + 2]) {
              options.extensionShow = args[i + 2];
              i += 2;
            } else if (nextArg === "configure" && args[i + 2]) {
              options.extensionConfigure = args[i + 2];
              i += 2;
            } else {
              // Treat unknown subcommand as list
              options.extensionsList = true;
            }
          } else {
            options.extensionsList = true;
          }
        }
        break;
      case "enable":
        options.enable = args[++i];
        break;
      case "disable":
        options.disable = args[++i];
        break;
      case "built-ins":
        // Check for wrap-up subcommand
        if (args[i + 1] === "wrap-up") {
          options.builtinsWrapUp = true;
          i++;
          // Check for --set flag
          if (args[i + 1] === "--set") {
            options.builtinsWrapUpSet = true;
            i++;
            // Check for -f flag or direct message
            const nextArg = args[i + 1];
            if (nextArg === "-f" || nextArg === "--file") {
              i++;
              options.builtinsWrapUpFile = args[i + 1];
              i++;
            } else if (nextArg && !nextArg.startsWith("-")) {
              // Collect the rest of the arguments as the message
              const messageParts: string[] = [];
              let msgArg = args[i + 1];
              while (msgArg && !msgArg.startsWith("-")) {
                messageParts.push(msgArg);
                i++;
                msgArg = args[i + 1];
              }
              options.builtinsWrapUpMessage = messageParts.join(" ");
            }
          }
        }
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
  otterassist <COMMAND> [ARGS]

OPTIONS:
  --setup          Run the setup wizard to configure OtterAssist
  --once           Run one check immediately, then exit
  --status         Show current status
  --events         List pending events
  -c, --config     Specify config file path
  -h, --help       Show this help message
  -v, --version    Show version

COMMANDS:
  install <source>    Install extension from path or git URL
    --link            Create symlink instead of copy (for development)
    --force           Overwrite existing extension
    --no-enable       Don't auto-enable after install

  uninstall <name>    Uninstall an extension

  extensions [list]        List installed extensions
  extensions show <name>   Show details for an extension
  extensions configure <name>  Configure an extension (if supported)

  enable <name>       Enable an extension
  disable <name>      Disable an extension

  built-ins wrap-up                    Show current wrap_up prompt
  built-ins wrap-up --set <message>    Set wrap_up prompt from string
  built-ins wrap-up --set -f <file>    Set wrap_up prompt from file

EXAMPLES:
  otterassist                        Start the daemon (foreground)
  otterassist --setup                Configure OtterAssist
  otterassist --once                 Process events once and exit

  otterassist install ./my-extension
  otterassist install ./my-extension --link
  otterassist install github:user/repo
  otterassist install https://github.com/user/repo.git

  otterassist extensions
  otterassist enable github-issues
  otterassist disable file-watcher
  otterassist uninstall my-extension

  otterassist built-ins wrap-up
  otterassist built-ins wrap-up --set "Custom wrap up message"
  otterassist built-ins wrap-up --set -f ./my-wrap-up.md
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
async function showStatus(configPath?: string): Promise<void> {
  const firstRun = await isFirstRun(configPath);

  if (firstRun) {
    console.log("🦦 OtterAssist Status: Not configured");
    console.log("Run 'otterassist --setup' to configure.");
    return;
  }

  const config = await loadConfig(configPath);
  console.log("🦦 OtterAssist Status");
  if (configPath) {
    console.log(`  Config: ${configPath}`);
  }
  console.log(`  Poll interval: ${config.pollIntervalSeconds}s`);
  console.log("  Extensions:");
  for (const [name, { enabled }] of Object.entries(config.extensions)) {
    console.log(`    ${enabled ? "✓" : "✗"} ${name}`);
  }
}

/**
 * Lists pending events
 */
async function listEvents(configPath?: string): Promise<void> {
  const firstRun = await isFirstRun(configPath);

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
async function initializeComponents(configPath?: string): Promise<Components> {
  const config = await loadConfig(configPath);
  const logger = new ConsoleLogger("info");

  // Initialize event queue
  const dbPath = join(homedir(), ".otterassist", "events.db");
  const eventQueue = await SQLiteEventQueue.create(dbPath, logger);

  // Initialize extension manager
  const extensionManager = new ExtensionManager(config, logger);
  await extensionManager.loadAll();

  // Get pi extension factories from loaded extensions
  const piExtensionFactories = extensionManager.getPiExtensions();
  if (piExtensionFactories.length > 0) {
    logger.info(
      `Passing ${piExtensionFactories.length} pi extension(s) to agent`,
    );
  }

  // Initialize agent runner with pi extensions
  const agentRunner = new AgentRunner({
    eventQueue,
    logger,
    piExtensionFactories,
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
async function runOnce(configPath?: string): Promise<void> {
  const firstRun = await isFirstRun(configPath);

  if (firstRun) {
    console.log("🦦 OtterAssist is not configured.");
    console.log("Run 'otterassist --setup' first.");
    process.exit(1);
  }

  console.log("🦦 Running single check...");

  let components: Components | undefined;
  try {
    components = await initializeComponents(configPath);
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
async function runDaemon(configPath?: string): Promise<void> {
  const firstRun = await isFirstRun(configPath);

  if (firstRun) {
    console.log("🦦 Welcome to OtterAssist!");
    console.log("Run 'otterassist --setup' to get started.");
    process.exit(0);
  }

  let components: Components | undefined;
  try {
    components = await initializeComponents(configPath);
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

// ============================================================================
// Extension Installer Commands
// ============================================================================

/**
 * Install an extension
 */
async function runInstall(
  source: string,
  options: { link: boolean; force: boolean; noEnable: boolean },
): Promise<void> {
  const logger = new ConsoleLogger("info");

  console.log(`🦦 Installing extension from: ${source}`);
  if (options.link) console.log("  Mode: symlink (development)");
  if (options.force) console.log("  Force: will overwrite existing");

  try {
    const installOptions: InstallOptions = {
      link: options.link,
      force: options.force,
      enable: !options.noEnable,
    };

    const result = await installExtension(source, installOptions, logger);

    console.log("\n✅ Extension installed successfully!");
    console.log(`  Name: ${result.extension.name}`);
    console.log(`  Description: ${result.extension.description}`);
    if (result.extension.version) {
      console.log(`  Version: ${result.extension.version}`);
    }
    console.log(`  Path: ${result.extension.path}`);
    console.log(`  Linked: ${result.wasLinked ? "yes" : "no"}`);
    console.log(
      `  Dependencies: ${result.dependenciesInstalled ? "installed" : "none"}`,
    );
    console.log(`  Enabled: ${result.wasEnabled ? "yes" : "no"}`);

    if (result.extension.gitUrl) {
      console.log(`  Source: ${result.extension.gitUrl}`);
    }
  } catch (error) {
    console.error(
      `❌ Failed to install extension: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

/**
 * Uninstall an extension
 */
async function runUninstall(name: string): Promise<void> {
  const logger = new ConsoleLogger("info");

  console.log(`🦦 Uninstalling extension: ${name}`);

  try {
    await uninstallExtension(name, logger);
    console.log("✅ Extension uninstalled successfully");
  } catch (error) {
    console.error(
      `❌ Failed to uninstall extension: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

/**
 * List installed extensions
 */
async function runExtensionsList(): Promise<void> {
  try {
    const extensions = await listInstalledExtensions();

    if (extensions.length === 0) {
      console.log("🦦 No extensions installed");
      console.log("\nInstall an extension with:");
      console.log("  otterassist install <path-or-url>");
      return;
    }

    console.log(`🦦 Installed Extensions (${extensions.length}):\n`);

    for (const ext of extensions) {
      const status = ext.enabled ? "✓" : "✗";
      const linkInfo = ext.linked ? " (linked)" : "";
      const versionInfo = ext.version ? ` v${ext.version}` : "";

      console.log(`  ${status} ${ext.name}${versionInfo}${linkInfo}`);
      console.log(`    ${ext.description}`);
    }

    console.log("\nCommands:");
    console.log("  otterassist enable <name>    Enable an extension");
    console.log("  otterassist disable <name>   Disable an extension");
    console.log("  otterassist extensions show <name>  Show details");
  } catch (error) {
    console.error(
      `❌ Failed to list extensions: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

/**
 * Show extension details
 */
async function runExtensionShow(name: string): Promise<void> {
  try {
    const ext = await getInstalledExtension(name);

    if (!ext) {
      console.log(`🦦 Extension "${name}" not found`);
      process.exit(1);
    }

    console.log(`🦦 Extension: ${ext.name}\n`);
    console.log(`  Description: ${ext.description}`);
    if (ext.version) {
      console.log(`  Version: ${ext.version}`);
    }
    console.log(`  Path: ${ext.path}`);
    console.log(`  Enabled: ${ext.enabled ? "yes" : "no"}`);
    console.log(`  Linked: ${ext.linked ? "yes" : "no"}`);
    if (ext.gitUrl) {
      console.log(`  Git URL: ${ext.gitUrl}`);
    }
    console.log(`  Installed: ${ext.installedAt.toLocaleString()}`);
  } catch (error) {
    console.error(
      `❌ Failed to show extension: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

/**
 * Configure an extension
 */
async function runExtensionConfigure(name: string): Promise<void> {
  const { ProcessTerminal, TUI } = await import("@mariozechner/pi-tui");
  const { loadExtensionFromPath, getBuiltinExtensions, GLOBAL_EXTENSIONS_DIR } = await import("../extensions/index.ts");
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");
  const { defaultTheme } = await import("../setup/wizard.ts");

  // First check built-in extensions
  const builtins = getBuiltinExtensions();
  const builtin = builtins.find(ext => ext.name === name);

  if (builtin) {
    // Built-in extension
    if (!builtin.isDirectory) {
      console.log(`🦦 Built-in extension "${name}" is not configurable (internal).`);
      process.exit(1);
    }

    if (!builtin.configure) {
      console.log(`🦦 Built-in extension "${name}" has no configuration options.`);
      process.exit(1);
    }

    console.log(`🦦 Configuring built-in extension: ${name}\n`);

    const logger = new ConsoleLogger("info");
    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal);

    try {
      // Start the TUI first
      tui.start();

      const saved = await builtin.configure({
        extensionDir: builtin.extensionDir,
        logger,
        tui,
        theme: defaultTheme,
      });

      if (saved) {
        console.log(`✅ Configuration saved for "${name}"`);
      } else {
        console.log(`🦦 Configuration cancelled.`);
      }
    } catch (error) {
      console.error(
        `❌ Failed to configure extension: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    } finally {
      tui.stop();
    }
    return;
  }

  // Check user-installed extensions
  const extPath = join(GLOBAL_EXTENSIONS_DIR, name);

  if (!existsSync(extPath)) {
    console.log(`🦦 Extension "${name}" not found.`);
    console.log(`   Run 'otterassist extensions list' to see available extensions.`);
    process.exit(1);
  }

  // Find entry point
  const indexPath = join(extPath, "index.ts");
  const singleFilePath = join(extPath, `${name}.ts`);
  const entryPoint = existsSync(indexPath) ? indexPath : singleFilePath;

  if (!existsSync(entryPoint)) {
    console.log(`🦦 Could not find extension entry point for "${name}".`);
    process.exit(1);
  }

  // Load the extension
  let extension;
  try {
    extension = await loadExtensionFromPath(entryPoint);
  } catch (error) {
    console.error(
      `❌ Failed to load extension: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }

  // Check if directory-based
  if (!extension.isDirectory) {
    console.log(`🦦 Extension "${name}" is not configurable (single-file format).`);
    console.log(`   Use directory format to enable configuration.`);
    process.exit(1);
  }

  // Check if it has a configure method
  if (!extension.configure) {
    console.log(`🦦 Extension "${name}" has no configuration options.`);
    process.exit(1);
  }

  console.log(`🦦 Configuring extension: ${name}\n`);

  const logger = new ConsoleLogger("info");
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  try {
    // Start the TUI first
    tui.start();

    const saved = await extension.configure({
      extensionDir: extension.extensionDir,
      logger,
      tui,
      theme: defaultTheme,
    });

    if (saved) {
      console.log(`✅ Configuration saved for "${name}"`);
    } else {
      console.log(`🦦 Configuration cancelled.`);
    }
  } catch (error) {
    console.error(
      `❌ Failed to configure extension: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  } finally {
    tui.stop();
  }
}

/**
 * Enable an extension
 */
async function runEnable(name: string): Promise<void> {
  const logger = new ConsoleLogger("info");

  try {
    await enableExtension(name, logger);
    console.log(`✅ Extension "${name}" enabled`);
  } catch (error) {
    console.error(
      `❌ Failed to enable extension: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

/**
 * Disable an extension
 */
async function runDisable(name: string): Promise<void> {
  const logger = new ConsoleLogger("info");

  try {
    await disableExtension(name, logger);
    console.log(`✅ Extension "${name}" disabled`);
  } catch (error) {
    console.error(
      `❌ Failed to disable extension: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

// ============================================================================
// Built-ins Commands
// ============================================================================

/**
 * Handle built-ins wrap-up command
 */
async function runBuiltInsWrapUp(options: {
  set: boolean;
  message?: string;
  file?: string;
}): Promise<void> {
  const agentDir = DEFAULT_AGENT_DIR;

  // If --set is not provided, just display the current prompt
  if (!options.set) {
    const content = await getWrapUpPrompt(agentDir);
    console.log("🦦 Current wrap_up prompt:\n");
    console.log(content);
    return;
  }

  // Validate that either message or file is provided, but not both
  if (options.message && options.file) {
    console.error(
      "❌ Cannot use both a message and a file. Please specify only one.",
    );
    process.exit(1);
  }

  if (!options.message && !options.file) {
    console.error(
      "❌ Please provide a message or specify a file with -f <file>",
    );
    process.exit(1);
  }

  try {
    let content: string;

    if (options.file) {
      // Read content from file
      const file = Bun.file(options.file);
      const exists = await file.exists();

      if (!exists) {
        console.error(`❌ File not found: ${options.file}`);
        process.exit(1);
      }

      content = await file.text();
      console.log(`🦦 Setting wrap_up prompt from: ${options.file}`);
    } else if (options.message) {
      // Use the provided message
      content = options.message;
      console.log("🦦 Setting wrap_up prompt...");
    } else {
      // This shouldn't happen due to earlier validation, but TypeScript needs it
      console.error("❌ No message or file provided");
      process.exit(1);
    }

    await setWrapUpPrompt(agentDir, content);
    console.log("✅ wrap_up prompt updated");
  } catch (error) {
    console.error(
      `❌ Failed to set wrap_up prompt: ${error instanceof Error ? error.message : error}`,
    );
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

  // Handle install
  if (options.install) {
    await runInstall(options.install, {
      link: options.installLink,
      force: options.installForce,
      noEnable: options.installNoEnable,
    });
    process.exit(0);
  }

  // Handle uninstall
  if (options.uninstall) {
    await runUninstall(options.uninstall);
    process.exit(0);
  }

  // Handle extensions list
  if (options.extensionsList) {
    await runExtensionsList();
    process.exit(0);
  }

  // Handle extension show
  if (options.extensionShow) {
    await runExtensionShow(options.extensionShow);
    process.exit(0);
  }

  // Handle extension configure
  if (options.extensionConfigure) {
    await runExtensionConfigure(options.extensionConfigure);
    process.exit(0);
  }

  // Handle enable
  if (options.enable) {
    await runEnable(options.enable);
    process.exit(0);
  }

  // Handle disable
  if (options.disable) {
    await runDisable(options.disable);
    process.exit(0);
  }

  // Handle built-ins wrap-up
  if (options.builtinsWrapUp) {
    await runBuiltInsWrapUp({
      set: options.builtinsWrapUpSet,
      message: options.builtinsWrapUpMessage,
      file: options.builtinsWrapUpFile,
    });
    process.exit(0);
  }

  // Handle status
  if (options.status) {
    await showStatus(options.config);
    process.exit(0);
  }

  // Handle events
  if (options.events) {
    await listEvents(options.config);
    process.exit(0);
  }

  // Handle once
  if (options.once) {
    await runOnce(options.config);
    process.exit(0);
  }

  // Default: start daemon
  await runDaemon(options.config);
}
