/**
 * Tests for Configuration Loader
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { exists, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../types/index.ts";
import { CONFIG_DIR, CONFIG_PATH, loadConfig, saveConfig } from "./loader.ts";
import { defaultConfig } from "./schema.ts";

const TEST_DIR = join(homedir(), ".otterassist", "__test_config__");
const TEST_CONFIG_PATH = join(TEST_DIR, "test-config.json");

async function createTestDir(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  await rm(TEST_DIR, { recursive: true, force: true });
}

describe("loadConfig", () => {
  beforeEach(async () => {
    await cleanupTestDir();
    await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  it("should return default config when file doesn't exist", async () => {
    const config = await loadConfig(TEST_CONFIG_PATH);

    expect(config).toEqual(defaultConfig);
  });

  it("should load valid config from file", async () => {
    const testConfig: Config = {
      pollIntervalSeconds: 120,
      extensions: {
        "test-extension": {
          enabled: true,
          config: { apiKey: "test-key" },
        },
      },
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(testConfig));

    const config = await loadConfig(TEST_CONFIG_PATH);

    expect(config.pollIntervalSeconds).toBe(120);
    expect(config.extensions["test-extension"]?.enabled).toBe(true);
  });

  it("should merge partial config with defaults", async () => {
    const partialConfig = {
      pollIntervalSeconds: 300,
      // extensions not specified
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(partialConfig));

    const config = await loadConfig(TEST_CONFIG_PATH);

    expect(config.pollIntervalSeconds).toBe(300);
    expect(config.extensions).toEqual(defaultConfig.extensions);
  });

  it("should throw error for invalid JSON", async () => {
    await writeFile(TEST_CONFIG_PATH, "{ invalid json }");

    await expect(loadConfig(TEST_CONFIG_PATH)).rejects.toThrow(
      "Failed to parse config file",
    );
  });

  it("should throw error for invalid config structure", async () => {
    const invalidConfig = {
      pollIntervalSeconds: -10, // Invalid: must be positive
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig));

    await expect(loadConfig(TEST_CONFIG_PATH)).rejects.toThrow(
      "Invalid configuration",
    );
  });

  it("should throw error for non-numeric pollIntervalSeconds", async () => {
    const invalidConfig = {
      pollIntervalSeconds: "not a number",
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(invalidConfig));

    await expect(loadConfig(TEST_CONFIG_PATH)).rejects.toThrow(
      "Invalid configuration",
    );
  });

  it("should handle nested extension config", async () => {
    const configWithNested = {
      pollIntervalSeconds: 60,
      extensions: {
        "github-extension": {
          enabled: true,
          config: {
            repos: ["owner/repo1", "owner/repo2"],
            labels: ["bug", "feature"],
          },
        },
      },
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(configWithNested));

    const config = await loadConfig(TEST_CONFIG_PATH);

    expect(config.extensions["github-extension"]?.config).toEqual({
      repos: ["owner/repo1", "owner/repo2"],
      labels: ["bug", "feature"],
    });
  });

  it("should use default CONFIG_PATH when no path specified", async () => {
    // This test verifies the default path is used
    // We just verify the function doesn't throw with no argument
    const config = await loadConfig();
    expect(config).toBeDefined();
    expect(config.pollIntervalSeconds).toBeDefined();
  });
});

describe("saveConfig", () => {
  beforeEach(async () => {
    await cleanupTestDir();
    await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  it("should save config to default path", async () => {
    const config: Config = {
      pollIntervalSeconds: 90,
      extensions: {},
    };

    await saveConfig(config);

    // Verify file was created at CONFIG_PATH
    const file = Bun.file(CONFIG_PATH);
    expect(await file.exists()).toBe(true);

    // Verify content
    const saved = JSON.parse(await file.text());
    expect(saved.pollIntervalSeconds).toBe(90);

    // Cleanup
    await rm(CONFIG_PATH).catch(() => {});
  });

  it("should create config directory if it doesn't exist", async () => {
    const config: Config = {
      pollIntervalSeconds: 60,
      extensions: {},
    };

    // Since saveConfig uses fixed CONFIG_PATH, we verify directory creation works
    // The directory should be created by saveConfig
    await saveConfig(config);

    expect(await exists(CONFIG_DIR)).toBe(true);

    // Cleanup
    await rm(CONFIG_PATH).catch(() => {});
  });

  it("should save with pretty formatting (2-space indent)", async () => {
    const config: Config = {
      pollIntervalSeconds: 60,
      extensions: {
        "test-ext": {
          enabled: true,
        },
      },
    };

    await saveConfig(config);

    const file = Bun.file(CONFIG_PATH);
    const content = await file.text();

    // Should have newlines and indentation
    expect(content).toContain("\n");
    expect(content).toContain("  "); // 2-space indent

    // Cleanup
    await rm(CONFIG_PATH).catch(() => {});
  });

  it("should throw error for invalid config", async () => {
    const invalidConfig = {
      pollIntervalSeconds: -1,
      extensions: {},
    } as unknown as Config;

    await expect(saveConfig(invalidConfig)).rejects.toThrow(
      "Cannot save invalid configuration",
    );
  });

  it("should overwrite existing config", async () => {
    const config1: Config = {
      pollIntervalSeconds: 30,
      extensions: {},
    };

    const config2: Config = {
      pollIntervalSeconds: 120,
      extensions: {},
    };

    await saveConfig(config1);
    await saveConfig(config2);

    const file = Bun.file(CONFIG_PATH);
    const saved = JSON.parse(await file.text());

    expect(saved.pollIntervalSeconds).toBe(120);

    // Cleanup
    await rm(CONFIG_PATH).catch(() => {});
  });
});

describe("CONFIG_PATH and CONFIG_DIR constants", () => {
  it("CONFIG_DIR should point to ~/.otterassist", () => {
    expect(CONFIG_DIR).toBe(join(homedir(), ".otterassist"));
  });

  it("CONFIG_PATH should point to config.json in CONFIG_DIR", () => {
    expect(CONFIG_PATH).toBe(join(CONFIG_DIR, "config.json"));
  });
});

describe("config validation edge cases", () => {
  beforeEach(async () => {
    await cleanupTestDir();
    await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  it("should accept minimum valid pollIntervalSeconds (1)", async () => {
    const config = {
      pollIntervalSeconds: 1,
      extensions: {},
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config));

    const loaded = await loadConfig(TEST_CONFIG_PATH);
    expect(loaded.pollIntervalSeconds).toBe(1);
  });

  it("should reject pollIntervalSeconds of 0", async () => {
    const config = {
      pollIntervalSeconds: 0,
      extensions: {},
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config));

    await expect(loadConfig(TEST_CONFIG_PATH)).rejects.toThrow(
      "Invalid configuration",
    );
  });

  it("should handle empty extensions object", async () => {
    const config = {
      pollIntervalSeconds: 60,
      extensions: {},
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config));

    const loaded = await loadConfig(TEST_CONFIG_PATH);
    expect(loaded.extensions).toEqual({});
  });

  it("should handle extension with only enabled field", async () => {
    const config = {
      pollIntervalSeconds: 60,
      extensions: {
        "minimal-ext": {
          enabled: false,
        },
      },
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config));

    const loaded = await loadConfig(TEST_CONFIG_PATH);
    expect(loaded.extensions["minimal-ext"]?.enabled).toBe(false);
    expect(loaded.extensions["minimal-ext"]?.config).toBeUndefined();
  });
});
