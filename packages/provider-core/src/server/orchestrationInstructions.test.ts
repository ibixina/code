import { assert, describe, it } from "@effect/vitest";

import {
  FCODE_DEVICE_TOOL_INSTRUCTIONS,
  FCODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH,
  FCODE_ORCHESTRATION_INSTRUCTIONS,
  fcodeAcpPromptWithInstructions,
  fcodeOrchestrationPrompt,
  fcodeOrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

describe("fcode device instructions", () => {
  it("route device work through device_open and give Claude the line that loads the tools", () => {
    for (const intent of ["`device_list`", "`device_open`", "`agent-device`", "ssh", "`hostId`"]) {
      assert.include(FCODE_DEVICE_TOOL_INSTRUCTIONS, intent);
    }
    assert.notInclude(FCODE_DEVICE_TOOL_INSTRUCTIONS, "ToolSearch");
    const loadLine =
      " Load them with ToolSearch `select:mcp__fcode__device_list,mcp__fcode__device_open,mcp__fcode__device_screenshot,mcp__fcode__device_close`.";
    assert.include(FCODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH, loadLine);
    assert.equal(
      FCODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH.replace(loadLine, ""),
      FCODE_DEVICE_TOOL_INSTRUCTIONS,
    );
  });

  it("open the app before the returned command's snapshots, screenshots and input", () => {
    assert.include(
      FCODE_DEVICE_TOOL_INSTRUCTIONS,
      "its snapshots, screenshots and input need `open <app>` first,",
    );
  });

  it("keep the failure rule from taking over or closing a session another thread holds", () => {
    // agent-device's DEVICE_IN_USE advice is to rerun with the owner's --session or close it first.
    assert.include(
      FCODE_DEVICE_TOOL_INSTRUCTIONS,
      "follow its advice once, but never reuse or close another session; if it still fails,",
    );
  });

  it("reach OpenCode and Cursor only when the session holds device access", () => {
    assert.include(fcodeOrchestrationSystemPrompt(true, true), FCODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(fcodeOrchestrationSystemPrompt(true, false), "## fcode devices");
    assert.isUndefined(fcodeOrchestrationSystemPrompt(false, true));

    const firstRun = (hasDeviceTools: boolean) =>
      fcodeOrchestrationPrompt({
        prompt: "Check the login screen.",
        hasFcodeMcp: true,
        hasDeviceTools,
        orchestrationDelivered: false,
        deviceInstructionsDelivered: false,
      });
    assert.include(firstRun(true), FCODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(firstRun(false), "## fcode devices");

    const laterRun = (deviceInstructionsDelivered: boolean) =>
      fcodeOrchestrationPrompt({
        prompt: "Check the login screen.",
        hasFcodeMcp: true,
        hasDeviceTools: true,
        orchestrationDelivered: true,
        deviceInstructionsDelivered,
      });
    assert.include(laterRun(false), FCODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(laterRun(false), FCODE_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(laterRun(true), "Check the login screen.");

    // A provider's own guidance reaches a conversation that already had the rest.
    const providerRun = (providerInstructionsDelivered: boolean) =>
      fcodeOrchestrationPrompt({
        prompt: "Check the login screen.",
        hasFcodeMcp: true,
        hasDeviceTools: false,
        orchestrationDelivered: true,
        deviceInstructionsDelivered: false,
        providerInstructions: "Mark awaited shells.",
        providerInstructionsDelivered,
      });
    assert.include(providerRun(false), "Mark awaited shells.");
    assert.notInclude(providerRun(false), FCODE_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(providerRun(true), "Check the login screen.");
  });

  it("reach ACP agents again when device access changes mid-thread", () => {
    const state = { interactionMode: "default", hasFcodeMcp: true, hasDeviceTools: false } as const;
    const withDevices = fcodeAcpPromptWithInstructions({
      prompt: "Check the login screen.",
      state: { ...state, hasDeviceTools: true },
      previousState: state,
    });
    assert.include(withDevices, FCODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.equal(
      fcodeAcpPromptWithInstructions({ prompt: "Again.", state, previousState: state }),
      "Again.",
    );
    assert.notInclude(fcodeAcpPromptWithInstructions({ prompt: "Hi.", state }), "## fcode devices");
  });
});
