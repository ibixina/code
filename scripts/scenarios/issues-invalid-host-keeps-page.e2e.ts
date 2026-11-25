import { expect } from "e2e";

import { test, WEB } from "./fcode.ts";

test("An invalid host filter keeps the Issues page open", WEB, async ({ fcode, app, browser }) => {
  await fcode.project("demo");
  await fcode.open("/issues?host=true");

  await app.screenshot("issues-invalid-host");
  await expect(browser.locator("h1")).toHaveText("Issues");
});
