/**
 * Poll interval screen for the setup wizard
 */

import { Container, Input, Text } from "@mariozechner/pi-tui";
import type {
  ScreenComponent,
  ScreenFactory,
  WizardState,
  WizardTheme,
} from "../wizard.ts";

/**
 * Poll interval screen component
 */
class PollIntervalScreen extends Container implements ScreenComponent {
  private theme: WizardTheme;
  private state: WizardState;
  private input: Input;
  private error: string | null = null;
  declare onResult?: (result: "next" | "back" | "done" | "cancel") => void;

  constructor(theme: WizardTheme, state: WizardState) {
    super();
    this.theme = theme;
    this.state = state;

    // Create input with current value
    this.input = new Input();
    this.input.setValue(String(state.pollIntervalSeconds));

    this.input.onSubmit = (value: string) => {
      const num = Number.parseInt(value.trim(), 10);

      if (!value.trim() || Number.isNaN(num) || num <= 0) {
        this.error = "Please enter a positive number";
        this.rebuild();
        return;
      }

      this.state.pollIntervalSeconds = num;
      this.onResult?.("next");
    };

    this.input.onEscape = () => {
      this.onResult?.("cancel");
    };

    this.buildContent();
  }

  private buildContent(): void {
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.accent(this.theme.bold("     ⏱️  Poll Interval")),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.text("     How often should OtterAssist check for events?"),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.muted(
          "     Enter the interval in seconds (e.g., 300 = 5 minutes):",
        ),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(this.input);
    this.addChild(new Text("", 0, 0)); // spacer

    if (this.error) {
      this.addChild(new Text(this.theme.error(`     ${this.error}`), 0, 0));
    } else {
      this.addChild(new Text("", 0, 0)); // spacer for consistency
    }

    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.dim("     Enter to continue, Escape to cancel"),
        0,
        0,
      ),
    );
  }

  private rebuild(): void {
    this.clear();
    this.buildContent();
  }

  handleInput(data: string): void {
    // Clear error on any input
    if (this.error) {
      this.error = null;
      this.rebuild();
    }
    // Pass to input
    this.input.handleInput(data);
  }
}

/**
 * Create the poll interval screen
 */
export const createPollIntervalScreen: ScreenFactory = (_tui, theme, state) => {
  return new PollIntervalScreen(theme, state);
};
