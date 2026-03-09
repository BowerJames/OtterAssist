/**
 * CLI interface
 * @see Issue #9
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  discoverExtensionInfo,
  isFirstRun,
  loadConfig,
  runSetupWizard,
} from "../index.ts";

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
  // This would require initializing the event queue
  // For now, just show a placeholder
  console.log("🦦 Pending Events:");
  console.log("  (Event listing not yet implemented)");
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
  console.log("  (Single check not yet implemented)");
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

  // Default: start daemon (not yet implemented)
  const firstRun = await isFirstRun();

  if (firstRun) {
    console.log("🦦 Welcome to OtterAssist!");
    console.log("Run 'otterassist --setup' to get started.");
    process.exit(0);
  }

  console.log("🦦 OtterAssist daemon starting...");
  console.log("  (Daemon mode not yet implemented)");
  console.log("Run 'otterassist --help' for usage information.");
}
