import {
  FCODE_PROJECT_FILE_NAME,
  type EnvironmentId,
  type ProjectReadFileResult,
  type FcodeProjectFile,
} from "@fcode/contracts";
import { parseFcodeProjectFile } from "@fcode/shared/fcodeProjectFile";
import { executeAtomQuery } from "@fcode/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";

import {
  getProjectFileQueryAtom,
  resolveProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

function toFcodeProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
  result: ProjectReadFileResult | null,
): FcodeProjectFile | null {
  const data = resolveProjectFileQueryData(
    environmentId,
    workspaceRoot,
    FCODE_PROJECT_FILE_NAME,
    result,
  );
  if (data === null || data.exists === false || data.truncated) return null;
  return parseFcodeProjectFile(data.contents);
}

export async function readFcodeProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): Promise<FcodeProjectFile | null> {
  const result = await executeAtomQuery(
    appAtomRegistry,
    getProjectFileQueryAtom(environmentId, workspaceRoot, FCODE_PROJECT_FILE_NAME),
    { reportDefect: false, reportFailure: false },
  );
  return toFcodeProjectFile(
    environmentId,
    workspaceRoot,
    result._tag === "Success" ? result.value : null,
  );
}

/** The project's fcode.json from an earlier read, or `undefined` when none has loaded yet. */
export function peekFcodeProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): FcodeProjectFile | null | undefined {
  const result = appAtomRegistry.get(
    getProjectFileQueryAtom(environmentId, workspaceRoot, FCODE_PROJECT_FILE_NAME),
  );
  return AsyncResult.isSuccess(result)
    ? toFcodeProjectFile(environmentId, workspaceRoot, result.value)
    : undefined;
}
