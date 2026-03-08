/**
 * CLI interface
 * @see Issue #9
 */

/**
 * Parses command line arguments and returns options
 */
export function parseArgs(_args: string[]): {
  setup: boolean;
  once: boolean;
  status: boolean;
  events: boolean;
  config?: string;
  help: boolean;
  version: boolean;
} {
  return {
    setup: false,
    once: false,
    status: false,
    events: false,
    config: undefined,
    help: false,
    version: false,
  };
}

/**
 * Runs the CLI
 */
export async function runCli(): Promise<void> {
  throw new Error("Not implemented - Issue #9");
}
