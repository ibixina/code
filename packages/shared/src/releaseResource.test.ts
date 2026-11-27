import { describe, expect, it } from "@effect/vitest";

import { releaseChannelOf } from "./releaseResource.ts";

describe("releaseChannelOf", () => {
  it.each([
    ["0.1.2", "stable"],
    ["0.1.2-nightly.20261025.1", "nightly"],
    ["0.1.2-preview.20261025.1", "preview"],
    ["0.1.2-pr.24340.123", "preview"],
  ] as const)("classifies %s as %s", (version, channel) => {
    expect(releaseChannelOf(version)).toBe(channel);
  });
});
