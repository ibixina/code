import { expect } from "e2e";

import { test, WEB } from "./fcode.ts";

test(
  "A seeded thread opens by its link and shows its history",
  WEB,
  async ({ fcode, app, screen }) => {
    const project = await fcode.project("demo");
    const thread = await fcode.thread({
      project,
      title: "Earlier work",
      messages: ["first", "second"],
    });
    await fcode.open(thread);

    await expect(screen.getByText("second fixture turn complete", { exact: false })).toBeVisible();
    await app.screenshot("thread");
  },
);
