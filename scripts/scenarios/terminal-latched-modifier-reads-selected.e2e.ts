import { expect } from "e2e";

import { MOBILE } from "../e2e.config.ts";
import { environmentId, runPromise } from "./fcode.ts";
import { IOS, test } from "./fcode-mobile.ts";

test(
  "A latched terminal ctrl key reads as selected to iOS accessibility",
  IOS,
  async ({ fcode, app, screen, device }) => {
    const project = await fcode.project("demo");
    const { threadId } = await fcode.thread({ project, title: "Latched keys", messages: ["hello"] });
    await fcode.open();
    await screen.getByText("Latched keys", { exact: false }).first().waitFor({ timeout: 120_000 });

    const environment = await runPromise(
      environmentId(`http://${MOBILE.host}:${MOBILE.serverPort}`),
    );
    await device.openLink(`fcode-dev://threads/${environment}/${threadId}/terminal`, {
      app: "com.fcode.app.dev",
    });
    await device.alert("accept").catch(() => {});

    // The keyboard toolbar shows with the software keyboard; ctrl starts past its right edge.
    const esc = screen.getByRole("button", "esc");
    await esc.waitFor({ timeout: 60_000 });
    const box = await esc.boundingBox();
    const x = (box?.x ?? 0) + (box?.width ?? 0);
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    // A slow drag, so the scroller stops with ctrl in view instead of flinging to its end.
    await screen.swipe({ from: { x, y }, to: { x: x - 150, y }, duration: 1_500 });
    const ctrl = screen.getByRole("button", "ctrl");
    await ctrl.waitFor();
    await ctrl.tap();
    await app.screenshot("ctrl-latched");
    await expect(ctrl).toBeSelected();

    await ctrl.tap();
    await expect(ctrl).not.toBeSelected();
  },
);
