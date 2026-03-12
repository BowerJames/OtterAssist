/**
 * Extensions screen for the setup wizard
 */

import {
  Container,
  Key,
  matchesKey,
  type SettingItem,
  SettingsList,
  Text,
} from "@mariozechner/pi-tui";
import type {
  ExtensionInfo,
  ScreenComponent,
  WizardState,
  WizardTheme,
} from "../wizard.ts";

/**
 * Extensions screen component
 */
class ExtensionsScreen extends Container implements ScreenComponent {
  private theme: WizardTheme;
  private state: WizardState;
  private extensions: ExtensionInfo[];
  private settingsList: SettingsList;
  declare onResult?: (result: "next" | "back" | "done" | "cancel") => void;

  constructor(
    theme: WizardTheme,
    state: WizardState,
    extensions: ExtensionInfo[],
  ) {
    super();
    this.theme = theme;
    this.state = state;
    this.extensions = extensions;

    // Build settings items - non-disableable extensions show as locked
    const items: SettingItem[] = extensions.map((ext) => {
      const isRequired = !ext.allowDisable;

      if (isRequired) {
        // Required extensions show as "required" and cannot be toggled
        return {
          id: ext.name,
          label: `${ext.name} 🔒`,
          currentValue: "required",
          values: ["required"] as const,
        };
      }

      // Optional extensions can be toggled
      return {
        id: ext.name,
        label: ext.isBuiltin ? `${ext.name} (built-in)` : ext.name,
        currentValue: state.extensions.get(ext.name)?.enabled ? "on" : "off",
        values: ["on", "off"] as const,
      };
    });

    // Create settings list with theme
    this.settingsList = new SettingsList(
      items,
      Math.min(items.length + 2, 15),
      {
        label: (s: string, selected: boolean) =>
          selected ? theme.accent(theme.bold(s)) : theme.text(s),
        value: (s: string, selected: boolean) => {
          if (s === "required") {
            return theme.muted("required");
          }
          return selected ? theme.accent(s) : theme.muted(s);
        },
        description: (s: string) => theme.dim(s),
        cursor: ">",
        hint: (s: string) => theme.dim(s),
      },
      (id: string, newValue: string) => {
        const ext = this.state.extensions.get(id);
        // Only allow toggling for optional extensions
        if (ext?.info.allowDisable) {
          ext.enabled = newValue === "on";
        }
      },
      () => {
        this.onResult?.("next");
      },
    );

    this.buildContent();
  }

  private buildContent(): void {
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(this.theme.accent(this.theme.bold("     🔌 Extensions")), 0, 0),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.text("     Enable or disable event source extensions."),
        0,
        0,
      ),
    );

    if (this.extensions.length === 0) {
      this.addChild(new Text("", 0, 0)); // spacer
      this.addChild(
        new Text(this.theme.muted("     No extensions found."), 0, 0),
      );
      this.addChild(
        new Text(
          this.theme.dim("     Add extensions to ~/.otterassist/extensions/"),
          0,
          0,
        ),
      );
    } else {
      this.addChild(
        new Text(
          this.theme.dim(`     Found ${this.extensions.length} extension(s)`),
          0,
          0,
        ),
      );
      this.addChild(
        new Text(
          this.theme.dim("     🔒 = required, cannot be disabled"),
          0,
          0,
        ),
      );
    }

    this.addChild(new Text("", 0, 0)); // spacer

    if (this.extensions.length > 0) {
      this.addChild(this.settingsList);
    }

    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.dim(
          "     ←/→ or Space to toggle, Enter to continue, Escape to cancel",
        ),
        0,
        0,
      ),
    );
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.onResult?.("cancel");
    } else if (this.extensions.length === 0 && matchesKey(data, Key.enter)) {
      // No extensions, just continue
      this.onResult?.("next");
    } else if (this.extensions.length > 0) {
      // Enter continues to next screen
      if (matchesKey(data, Key.enter)) {
        this.onResult?.("next");
      } else {
        // Pass other input to settings list (arrows, space for toggle)
        this.settingsList.handleInput(data);
      }
    }
  }
}

/**
 * Create the extensions screen
 */
export const createExtensionsScreen = (
  _tui: unknown,
  theme: WizardTheme,
  state: WizardState,
  extensions: ExtensionInfo[],
): ScreenComponent => {
  return new ExtensionsScreen(theme, state, extensions);
};
