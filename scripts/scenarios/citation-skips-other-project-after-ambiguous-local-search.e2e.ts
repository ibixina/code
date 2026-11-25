import { expect } from "e2e";

import { test, WEB } from "./fcode.ts";

test(
  "A bare citation leaves the file unresolved when the thread project has ambiguous matches",
  WEB,
  async ({ fcode, app, browser, screen }) => {
    const project = await fcode.project("support", {
      "current/Handoff.txt": "Current support handoff",
      "archive/HANDOFF.txt": "Archived support handoff",
    });
    await fcode.project("reports", { "notes/HANDOFF.txt": "Report handoff" });
    const thread = await fcode.thread({
      project,
      title: "Find the handoff",
      messages: ['See :codex-file-citation{path="handoff.txt" line_range_start="1"}'],
    });

    await fcode.open(thread);
    await screen.getByRole("button", /^Agent See/).tap();
    await screen.getByRole("link", /^handoff\.txt/).tap();

    try {
      await expect(
        browser
          .locator("[data-right-panel-surface-content]")
          .getByText("The file could not be accessed or read. It may be missing or inaccessible."),
      ).toBeVisible();
    } finally {
      await app.screenshot("ambiguous-local-handoff-citation");
    }
  },
);
