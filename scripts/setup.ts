import {
  getOtterAssistHome,
  ensureDirectories,
  ensureConfig,
  getConfigPath,
} from "../src/tools/env";

async function main() {
  const home = getOtterAssistHome();
  const configPath = getConfigPath();

  console.log(`Setting up OtterAssist at ${home}...`);
  console.log();

  await ensureDirectories();
  console.log("✓ Created directories:");
  console.log("  - workspace/");
  console.log("  - logs/");
  console.log("  - logs/trajectories/");

  const config = await ensureConfig();
  console.log();
  console.log(`✓ Configuration file: ${configPath}`);
  console.log("  Current settings:");
  console.log(`    - LLM Provider: ${config.llmProvider}`);
  console.log(`    - LLM Model: ${config.llmModel}`);
  console.log(`    - Log Level: ${config.logLevel}`);

  console.log();
  console.log("✓ Setup complete!");
  console.log();
  console.log("Next steps:");
  console.log("  1. Set CONVEX_URL environment variable");
  console.log("  2. Set OPENAI_API_KEY or ANTHROPIC_API_KEY");
  console.log("  3. Run 'bun run convex' to start Convex dev server");
  console.log("  4. Run 'bun run service' to start the service");
}

main().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
