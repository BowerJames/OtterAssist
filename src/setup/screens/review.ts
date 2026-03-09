/**
 * Review screen for the setup wizard
 */

import { Container, Key, matchesKey, Text } from "@mariozechner/pi-tui";
import type {
  ScreenComponent,
  ScreenFactory,
  WizardState,
  WizardTheme,
} from "../wizard.ts";

/**
 * Review screen component
 */
class ReviewScreen extends Container implements ScreenComponent {
  private theme: WizardTheme;
  private state: WizardState;
  declare onResult?: (result: "next" | "back" | "done" | "cancel") => void;

  constructor(theme: WizardTheme, state: WizardState) {
    super();
    this.theme = theme;
    this.state = state;
    this.buildContent();
  }

  private buildContent(): void {
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.accent(this.theme.bold("     ✅ Review Configuration")),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.text("     Please review your settings before saving:"),
        0,
        0,
      ),
    );
    this.addChild(new Text("", 0, 0)); // spacer

    // Poll interval
    const minutes = Math.floor(this.state.pollIntervalSeconds / 60);
    const seconds = this.state.pollIntervalSeconds % 60;
    const intervalDisplay =
      minutes > 0
        ? `${minutes} minute${minutes > 1 ? "s" : ""}${seconds > 0 ? ` ${seconds}s` : ""}`
        : `${this.state.pollIntervalSeconds} seconds`;

    this.addChild(new Text(this.theme.muted("     Poll Interval:"), 0, 0));
    this.addChild(new Text(this.theme.text(`       ${intervalDisplay}`), 0, 0));
    this.addChild(new Text("", 0, 0)); // spacer

    // Extensions
    const enabledExtensions = [...this.state.extensions.entries()]
      .filter(([, { enabled }]) => enabled)
      .map(([name]) => name);

    this.addChild(new Text(this.theme.muted("     Enabled Extensions:"), 0, 0));

    if (enabledExtensions.length === 0) {
      this.addChild(new Text(this.theme.dim("       (none)"), 0, 0));
    } else {
      for (const name of enabledExtensions) {
        this.addChild(new Text(this.theme.text(`       • ${name}`), 0, 0));
      }
    }

    this.addChild(new Text("", 0, 0)); // spacer

    // Disabled count
    const disabledCount = this.state.extensions.size - enabledExtensions.length;
    if (disabledCount > 0) {
      this.addChild(
        new Text(
          this.theme.dim(`     ${disabledCount} extension(s) disabled`),
          0,
          0,
        ),
      );
      this.addChild(new Text("", 0, 0)); // spacer
    }

    this.addChild(new Text("", 0, 0)); // spacer
    this.addChild(
      new Text(
        this.theme.success(
          this.theme.bold("     Press Enter to save and finish"),
        ),
        0,
        0,
      ),
    );
    this.addChild(new Text(this.theme.dim("     Escape to cancel"), 0, 0));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter)) {
      this.onResult?.("done");
    } else if (matchesKey(data, Key.escape)) {
      this.onResult?.("cancel");
    }
  }
}

/**
 * Create the review screen
 */
export const createReviewScreen: ScreenFactory = (_tui, theme, state) => {
  return new ReviewScreen(theme, state);
};
