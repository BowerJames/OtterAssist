import { EventProcessor, type EventProcessorConfig } from "../events/processor";
import { FileWatcher, type WatcherConfig } from "../events/watcher";
import { createLLMProvider, type LLMProviderName } from "../llm/factory";
import { createDefaultToolRegistry } from "../tools/factory";
import {
  ensureDirectories,
  loadConfig,
  type OtterAssistConfig,
} from "../tools/env";

interface ServiceComponents {
  eventProcessor: EventProcessor;
  fileWatcher: FileWatcher;
}

let components: ServiceComponents | null = null;
let shuttingDown = false;

function log(level: string, message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

function createEventProcessor(config: OtterAssistConfig): EventProcessor {
  const processorConfig: EventProcessorConfig = {
    pollIntervalMs: config.eventPollIntervalMs,
  };

  return new EventProcessor(
    {
      createLLMProvider: (provider: string, model: string) => {
        return createLLMProvider({
          provider: provider as LLMProviderName,
          model,
        });
      },
      createToolRegistry: () => createDefaultToolRegistry(),
      onProgress: (progress) => {
        log("debug", `Agent progress: ${JSON.stringify(progress)}`);
      },
    },
    processorConfig
  );
}

function createFileWatcher(config: OtterAssistConfig): FileWatcher {
  const watcherConfig: WatcherConfig = {
    debounceMs: config.fileWatcherDebounceMs,
  };

  return new FileWatcher(watcherConfig);
}

async function startService(): Promise<ServiceComponents> {
  log("info", "Starting OtterAssist service...");

  await ensureDirectories();
  log("info", "Directories ensured");

  const config = await loadConfig();
  log("info", `Configuration loaded (provider: ${config.llmProvider}, model: ${config.llmModel})`);

  const eventProcessor = createEventProcessor(config);
  const fileWatcher = createFileWatcher(config);

  await eventProcessor.start();
  log("info", "Event processor started");

  await fileWatcher.start();
  log("info", "File watcher started");

  log("info", "OtterAssist service is running");

  return { eventProcessor, fileWatcher };
}

async function stopService(): Promise<void> {
  if (!components) {
    return;
  }

  log("info", "Stopping OtterAssist service...");

  components.eventProcessor.stop();
  log("info", "Event processor stopped");

  components.fileWatcher.stop();
  log("info", "File watcher stopped");

  components = null;
  log("info", "OtterAssist service stopped");
}

function setupSignalHandlers(): void {
  const handleShutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log("info", `Received ${signal}, shutting down...`);
    await stopService();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

async function main(): Promise<void> {
  setupSignalHandlers();

  try {
    components = await startService();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", `Failed to start service: ${message}`);
    process.exit(1);
  }
}

main();
