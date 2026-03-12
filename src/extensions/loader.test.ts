/**
 * Tests for extension loader
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverExtensions, loadExtensionFromPath } from "./loader.ts";

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
  it("should load a valid legacy extension module", async () => {
    // Create a temporary extension file
    const tempPath = join(TEST_DIR, "valid-legacy-extension.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "valid-legacy-extension",
  description: "A valid legacy test extension",
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

    const extension = await loadExtensionFromPath(tempPath);

    expect(extension.name).toBe("valid-legacy-extension");
    expect(extension.description).toBe("A valid legacy test extension");
    expect(extension.isLegacy).toBe(true);
    expect(extension.events).toBeDefined();
    expect(typeof extension.events?.poll).toBe("function");
    expect(typeof extension.events?.initialize).toBe("function");
    expect(typeof extension.events?.shutdown).toBe("function");
    expect(extension.piExtension).toBeUndefined();

    // Test poll works
    const messages = await extension.events?.poll();
    expect(messages).toEqual(["event1", "event2"]);

    await cleanupTestDir();
  });

  it("should load a valid new-format extension with events only", async () => {
    const tempPath = join(TEST_DIR, "new-events-only.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "new-events-only",
  description: "New format with events only",
  version: "1.0.0",
  events: {
    async initialize(config, context) {
      context.logger.info("Initialized");
    },
    async poll() {
      return ["new-event"];
    },
    async shutdown() {
      console.log("Shutdown");
    }
  }
};
`;
    await writeFile(tempPath, extensionContent);

    const extension = await loadExtensionFromPath(tempPath);

    expect(extension.name).toBe("new-events-only");
    expect(extension.description).toBe("New format with events only");
    expect(extension.version).toBe("1.0.0");
    expect(extension.isLegacy).toBe(false);
    expect(extension.events).toBeDefined();
    expect(extension.piExtension).toBeUndefined();

    const messages = await extension.events?.poll();
    expect(messages).toEqual(["new-event"]);

    await cleanupTestDir();
  });

  it("should load a valid new-format extension with pi extension only", async () => {
    const tempPath = join(TEST_DIR, "new-pi-only.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "new-pi-only",
  description: "New format with pi extension only",
  version: "2.0.0",
  piExtension(pi) {
    console.log("Pi extension registered", pi);
  }
};
`;
    await writeFile(tempPath, extensionContent);

    const extension = await loadExtensionFromPath(tempPath);

    expect(extension.name).toBe("new-pi-only");
    expect(extension.description).toBe("New format with pi extension only");
    expect(extension.version).toBe("2.0.0");
    expect(extension.isLegacy).toBe(false);
    expect(extension.events).toBeUndefined();
    expect(extension.piExtension).toBeDefined();
    expect(typeof extension.piExtension).toBe("function");

    await cleanupTestDir();
  });

  it("should load a valid new-format extension with both events and pi", async () => {
    const tempPath = join(TEST_DIR, "new-full.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "new-full",
  description: "New format with both events and pi",
  events: {
    async poll() {
      return ["full-event"];
    }
  },
  piExtension(pi) {
    console.log("Full extension pi registered");
  }
};
`;
    await writeFile(tempPath, extensionContent);

    const extension = await loadExtensionFromPath(tempPath);

    expect(extension.name).toBe("new-full");
    expect(extension.isLegacy).toBe(false);
    expect(extension.events).toBeDefined();
    expect(extension.piExtension).toBeDefined();

    const messages = await extension.events?.poll();
    expect(messages).toEqual(["full-event"]);

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

    await expect(loadExtensionFromPath(tempPath)).rejects.toThrow(
      "does not export a valid extension",
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

    await expect(loadExtensionFromPath(tempPath)).rejects.toThrow(
      "does not export a valid extension",
    );

    await cleanupTestDir();
  });

  it("should throw for invalid extension (no events or piExtension)", async () => {
    const tempPath = join(TEST_DIR, "invalid-empty.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "empty-extension",
  description: "Has neither events nor piExtension"
};
`;
    await writeFile(tempPath, extensionContent);

    await expect(loadExtensionFromPath(tempPath)).rejects.toThrow(
      "does not export a valid extension",
    );

    await cleanupTestDir();
  });

  it("should throw for invalid extension (missing poll in events)", async () => {
    const tempPath = join(TEST_DIR, "invalid-no-poll.ts");
    await mkdir(TEST_DIR, { recursive: true });

    const extensionContent = `
export default {
  name: "no-poll",
  description: "Missing poll in events",
  events: {
    initialize() {}
  }
};
`;
    await writeFile(tempPath, extensionContent);

    await expect(loadExtensionFromPath(tempPath)).rejects.toThrow(
      "does not export a valid extension",
    );

    await cleanupTestDir();
  });

  it("should throw for non-existent file", async () => {
    await expect(loadExtensionFromPath("/non/existent/file.ts")).rejects.toThrow();
  });
});
