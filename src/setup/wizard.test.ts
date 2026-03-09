/**
 * Test for setup wizard
 * @see Issue #8
 */

import { describe, expect, test } from "bun:test";
import { defaultTheme, type ExtensionInfo, SetupWizard } from "./wizard.ts";

// Mock extension data
const mockExtensions: ExtensionInfo[] = [
  {
    name: "test-extension",
    description: "A test extension",
    path: "/tmp/test-extension.ts",
  },
  {
    name: "another-extension",
    description: "Another test extension",
    path: "/tmp/another-extension.ts",
  },
];

describe("SetupWizard", () => {
  describe("defaultTheme", () => {
    test("should have all required theme functions", () => {
      expect(typeof defaultTheme.accent).toBe("function");
      expect(typeof defaultTheme.text).toBe("function");
      expect(typeof defaultTheme.muted).toBe("function");
      expect(typeof defaultTheme.dim).toBe("function");
      expect(typeof defaultTheme.success).toBe("function");
      expect(typeof defaultTheme.error).toBe("function");
      expect(typeof defaultTheme.bold).toBe("function");
    });

    test("should wrap text with ANSI codes", () => {
      const result = defaultTheme.accent("test");
      expect(result).toContain("test");
      expect(result).toContain("\x1b[");
    });
  });

  describe("constructor", () => {
    test("should initialize with extensions", () => {
      const wizard = new SetupWizard(mockExtensions);
      expect(wizard).toBeDefined();
    });

    test("should initialize with existing config", () => {
      const existingConfig = {
        pollIntervalSeconds: 600,
        extensions: {
          "test-extension": { enabled: true },
        },
      };
      const wizard = new SetupWizard(mockExtensions, existingConfig);
      expect(wizard).toBeDefined();
    });
  });
});
