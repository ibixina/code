import { describe, expect, it } from "vite-plus/test";

import {
  FCODE_MCP_TOOL_NAMES,
  resolveFcodeMcpSummaryAction,
  resolveFcodeMcpToolDefinition,
  resolveFcodeMcpToolPresentation,
} from "./fcodeMcpToolPresentation.ts";

describe("resolveFcodeMcpToolPresentation", () => {
  it("recognizes every fcode tool across provider prefixes and completion suffixes", () => {
    for (const tool of FCODE_MCP_TOOL_NAMES) {
      const presentation = resolveFcodeMcpToolPresentation(tool);
      for (const prefix of [
        "mcp__t3-code__",
        "mcp__t3_code__",
        "mcp__fcode__",
        "t3-code.",
        "fcode.",
        "fcode-direct.",
        "mcp__fcode_direct__",
        "fcode/",
        "fcode:",
        "mcp_fcode_",
        "fcode ",
        "fcode · ",
      ]) {
        expect(resolveFcodeMcpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveFcodeMcpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveFcodeMcpToolPresentation("fcode-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("Delegate a child task");
    expect(resolveFcodeMcpToolPresentation("fcode-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });

  it("keeps the presentation of saved T3 Code calls after the rename", () => {
    expect(resolveFcodeMcpToolPresentation("mcp__t3-code__t3_thread_read")).toEqual(
      resolveFcodeMcpToolPresentation("mcp__fcode__fcode_thread_read"),
    );
  });
});

describe("resolveFcodeMcpToolDefinition", () => {
  it("labels an action tool call as the action it ran", () => {
    expect(
      resolveFcodeMcpToolDefinition("mcp__t3-code__preview_act", { action: "type" })?.labels,
    ).toEqual(resolveFcodeMcpToolDefinition("preview_type")?.labels);
    expect(resolveFcodeMcpToolDefinition("fcode_thread_transfer", { action: "fork" })?.displayName).toBe(
      resolveFcodeMcpToolDefinition("fcode_thread_fork")?.displayName,
    );
    expect(resolveFcodeMcpToolDefinition("preview_act", { action: "unknown" })?.labels[2]).toBe(
      "Used",
    );
  });
});

describe("resolveFcodeMcpSummaryAction", () => {
  it("summarizes an action tool by the action each call ran", () => {
    expect(resolveFcodeMcpSummaryAction("mcp__t3-code__fcode_queue", { action: "list" })).toBe(
      "queue-list",
    );
    expect(resolveFcodeMcpSummaryAction("fcode_queue", { action: "edit" })).toBe("queue-edit");
    expect(resolveFcodeMcpSummaryAction("fcode_thread_transfer", { action: "status" })).toBe(
      "thread-transfers",
    );
    expect(resolveFcodeMcpSummaryAction("fcode_thread_configure", {})).toBe("thread-configuration");
    expect(resolveFcodeMcpSummaryAction("schedule_task", { scheduledTaskId: "task-1" })).toBe(
      "schedule-update",
    );
    expect(resolveFcodeMcpSummaryAction("delegate_task", { task: "x" })).toBe("delegate");
  });
});
