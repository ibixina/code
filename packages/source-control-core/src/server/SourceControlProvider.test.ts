import { assert, it } from "@effect/vitest";

import {
  repositoryPathFromRemoteUrl,
  transportSafeSourceControlErrorValue,
} from "./SourceControlProvider.ts";

it("removes URL credentials, query parameters, and fragments from error transport values", () => {
  assert.strictEqual(
    transportSafeSourceControlErrorValue(
      "https://user:secret@example.test/org/repo/pull/42?token=secret#discussion",
    ),
    "https://example.test/org/repo/pull/42",
  );
});

it.each([
  ["git@github.com:Fcode/fcode.git", "Fcode/fcode"],
  ["github.com:Fcode/fcode.git", "Fcode/fcode"],
  ["gitlab.com:Fcode/platform/fcode", "Fcode/platform/fcode"],
  ["https://github.com/Fcode/fcode.git", "Fcode/fcode"],
  ["https://github.com/Fcode/fcode.git?view=compact", "Fcode/fcode"],
  ["https://github.com/Fcode/fcode.git#section", "Fcode/fcode"],
  ["C:/repos/fcode", null],
])("reads the repository path of %s", (remoteUrl, expected) => {
  assert.strictEqual(repositoryPathFromRemoteUrl(remoteUrl), expected);
});
