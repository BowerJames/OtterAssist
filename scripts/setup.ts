import { $ } from "bun";

const OTTER_ASSIST_HOME = process.env.OTTER_ASSIST_HOME || `${process.env.HOME}/.otter_assist`;

console.log(`Setting up OtterAssist at ${OTTER_ASSIST_HOME}...`);

await $`mkdir -p ${OTTER_ASSIST_HOME}/workspace`.quiet();

console.log("✓ Created workspace directory");
console.log("✓ Setup complete");
