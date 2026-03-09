/**
 * Welcome screen for the setup wizard
 */

import { Container, Key, matchesKey, Text } from "@mariozechner/pi-tui";
import type { ScreenComponent, ScreenFactory, WizardTheme } from "../wizard.ts";

/**
 * Welcome screen component
 */
class WelcomeScreen extends Container implements ScreenComponent {
  private theme: WizardTheme;
  declare onResult?: (result: "next" | "back" | "done" | "cancel") => void;

  constructor(theme: WizardTheme) {
    super();
    this.theme = theme;
    this.buildContent();
  }

  private buildContent(): void {
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.accent(this.theme.bold("     🦦 Welcome to OtterAssist!")),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.text(
          "     OtterAssist is an AI agent that runs locally on your computer.",
        ),
        0,
        0,
      ),
    );
    this.addChild(
      new Text(
        this.theme.text(
          "     It operates on an event-driven model where events are queued",
        ),
        0,
        0,
      ),
    );
    this.addChild(
      new Text(
        this.theme.text(
          "     and processed by an AI agent on a scheduled basis.",
        ),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(this.theme.muted("     This wizard will help you:"), 0, 0),
    );
    this.addChild(
      new Text(
        this.theme.text("       • Set the poll interval for checking events"),
        0,
        0,
      ),
    );
    this.addChild(
      new Text(
        this.theme.text("       • Enable or disable event source extensions"),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.dim("     Press Enter to continue, Escape to cancel"),
        0,
        0,
      ),
    );
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter)) {
      this.onResult?.("next");
    } else if (matchesKey(data, Key.escape)) {
      this.onResult?.("cancel");
    }
  }
}

/**
 * Create the welcome screen
 */
export const createWelcomeScreen: ScreenFactory = (_tui, theme, _state) => {
  return new WelcomeScreen(theme);
};
