/**
 * Tests for built-in extensions
 * @see Issue #37
 */

import { describe, expect, test } from "bun:test";
import {
  BUILTIN_EXTENSIONS,
  getOptionalExtensions,
  getRequiredExtensions,
  wrapUpState,
} from "../builtins/index.ts";
import { getBuiltinExtensions } from "../extensions/loader.ts";

describe("Built-in Extensions", () => {
  describe("BUILTIN_EXTENSIONS", () => {
    test("should contain wrap-up-manager and context-threshold", () => {
      const names = BUILTIN_EXTENSIONS.map((ext) => ext.name);
      expect(names).toContain("wrap-up-manager");
      expect(names).toContain("context-threshold");
    });

    test("all extensions should have required properties", () => {
      for (const ext of BUILTIN_EXTENSIONS) {
        expect(ext.name).toBeDefined();
        expect(ext.description).toBeDefined();
        expect(typeof ext.name).toBe("string");
        expect(typeof ext.description).toBe("string");
      }
    });
  });

  describe("getRequiredExtensions", () => {
    test("should return only extensions with allowDisable: false", () => {
      const required = getRequiredExtensions();
      const names = required.map((ext) => ext.name);

      expect(names).toContain("wrap-up-manager");
      expect(names).not.toContain("context-threshold");
    });

    test("all required extensions should have allowDisable: false", () => {
      const required = getRequiredExtensions();
      for (const ext of required) {
        expect(ext.allowDisable).toBe(false);
      }
    });
  });

  describe("getOptionalExtensions", () => {
    test("should return only extensions with allowDisable: true", () => {
      const optional = getOptionalExtensions();
      const names = optional.map((ext) => ext.name);

      expect(names).toContain("context-threshold");
      expect(names).not.toContain("wrap-up-manager");
    });
  });

  describe("getBuiltinExtensions (loader)", () => {
    test("should return LoadedExtension objects with correct properties", () => {
      const loaded = getBuiltinExtensions();

      expect(loaded.length).toBe(BUILTIN_EXTENSIONS.length);

      for (const ext of loaded) {
        expect(ext.isBuiltin).toBe(true);
        expect(typeof ext.allowDisable).toBe("boolean");
        expect(ext.name).toBeDefined();
        expect(ext.description).toBeDefined();
      }
    });

    test("wrap-up-manager should have allowDisable: false", () => {
      const loaded = getBuiltinExtensions();
      const wrapUpManager = loaded.find(
        (ext) => ext.name === "wrap-up-manager",
      );

      expect(wrapUpManager).toBeDefined();
      expect(wrapUpManager?.allowDisable).toBe(false);
    });

    test("context-threshold should have allowDisable: true", () => {
      const loaded = getBuiltinExtensions();
      const contextThreshold = loaded.find(
        (ext) => ext.name === "context-threshold",
      );

      expect(contextThreshold).toBeDefined();
      expect(contextThreshold?.allowDisable).toBe(true);
    });
  });

  describe("wrapUpState", () => {
    test("should have queued property initialized to false", () => {
      expect(wrapUpState.queued).toBe(false);
    });

    test("should allow setting queued to true", () => {
      const originalValue = wrapUpState.queued;
      wrapUpState.queued = true;
      expect(wrapUpState.queued).toBe(true);
      wrapUpState.queued = originalValue; // Reset
    });
  });
});
