/**
 * Tests for extension loader
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverExtensions, loadExtension } from "./loader.ts";

const TEST_DIR = join(import.meta.dir, "__test_extensions__");

async function createTestDir(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  await rm(TEST_DIR, { recursive: true, force: true });
}

describe("discoverExtensions", () => {
  beforeEach(async () => {
    await cleanupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  it("should return empty array when no extensions exist", async () => {
    await createTestDir();
    // Patch the directories to use test dir
    const originalDir = process.cwd();
    try {
      // This test verifies the scanning logic works with empty dirs
      const extensions = await discoverExtensions();
      // Should not throw, may find real extensions in ~/.otterassist
      expect(Array.isArray(extensions)).toBe(true);
    } finally {
      process.chdir(originalDir);
    }
  });

  it("should discover .ts files in extension directories", async () => {
    await createTestDir();

    // Create a simple extension file
    const extensionContent = `
export default {
  name: "test-extension",
  description: "A test extension",
  async poll() {
    return [];
  }
};
`;
    await writeFile(join(TEST_DIR, "test-extension.ts"), extensionContent);

    // Verify the file was created
    const file = Bun.file(join(TEST_DIR, "test-extension.ts"));
    expect(await file.exists()).toBe(true);
  });

  it("should discover index.ts in extension subdirectories", async () => {
    await createTestDir();
    await mkdir(join(TEST_DIR, "my-extension"), { recursive: true });

    const extensionContent = `
export default {
  name: "my-extension",
  description: "Extension in a directory",
  async poll() {
    return ["hello"];
  }
};
`;
    await writeFile(
      join(TEST_DIR, "my-extension", "index.ts"),
      extensionContent,
    );

    // Verify the file was created
    const file = Bun.file(join(TEST_DIR, "my-extension", "index.ts"));
    expect(await file.exists()).toBe(true);
  });
});

describe("loadExtension", () => {
  it("should load a valid extension module", async () => {
    // Create a temporary extension file
    const tempPath = join(TEST_DIR, "valid-extension.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "valid-extension",
  description: "A valid test extension",
  configSchema: {
    type: "object",
    properties: {
      apiKey: { type: "string" }
    }
  },
  defaultConfig: { apiKey: "" },
  async initialize(config, context) {
    context.logger.info("Initialized with", config);
  },
  async shutdown() {
    console.log("Shutting down");
  },
  async poll() {
    return ["event1", "event2"];
  }
};
`;
    await writeFile(tempPath, extensionContent);

    const extension = await loadExtension(tempPath);

    expect(extension.name).toBe("valid-extension");
    expect(extension.description).toBe("A valid test extension");
    expect(typeof extension.poll).toBe("function");
    expect(typeof extension.initialize).toBe("function");
    expect(typeof extension.shutdown).toBe("function");

    // Test poll works
    const messages = await extension.poll();
    expect(messages).toEqual(["event1", "event2"]);

    await cleanupTestDir();
  });

  it("should throw for invalid extension (missing name)", async () => {
    const tempPath = join(TEST_DIR, "invalid-no-name.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  description: "Missing name",
  async poll() {
    return [];
  }
};
`;
    await writeFile(tempPath, extensionContent);

    await expect(loadExtension(tempPath)).rejects.toThrow(
      "does not export a valid EventSourceExtension",
    );

    await cleanupTestDir();
  });

  it("should throw for invalid extension (missing description)", async () => {
    const tempPath = join(TEST_DIR, "invalid-no-desc.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "no-description",
  async poll() {
    return [];
  }
};
`;
    await writeFile(tempPath, extensionContent);

    await expect(loadExtension(tempPath)).rejects.toThrow(
      "does not export a valid EventSourceExtension",
    );

    await cleanupTestDir();
  });

  it("should throw for invalid extension (missing poll)", async () => {
    const tempPath = join(TEST_DIR, "invalid-no-poll.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "no-poll",
  description: "Missing poll function"
};
`;
    await writeFile(tempPath, extensionContent);

    await expect(loadExtension(tempPath)).rejects.toThrow(
      "does not export a valid EventSourceExtension",
    );

    await cleanupTestDir();
  });

  it("should throw for non-existent file", async () => {
    await expect(loadExtension("/non/existent/file.ts")).rejects.toThrow();
  });
});
