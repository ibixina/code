import {
  FCODE_PROJECT_FILE_NAME,
  type EnvironmentId,
  type FcodeProjectFile,
  type FcodeProjectFileScript,
} from "@fcode/contracts";
import { parseFcodeProjectFile } from "@fcode/shared/fcodeProjectFile";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<FcodeProjectFileScript> = [];

export interface FcodeProjectFileState {
  status: "loading" | "missing" | "invalid" | "valid";
  file: FcodeProjectFile | null;
  scripts: ReadonlyArray<FcodeProjectFileScript>;
  refresh: () => void;
}

export function useFcodeProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): FcodeProjectFileState {
  const query = useProjectFileQuery(environmentId, cwd ?? "", FCODE_PROJECT_FILE_NAME, cwd !== null);
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  const refresh = query.refresh;
  if (contents === null) {
    return {
      status: isPending ? "loading" : "missing",
      file: null,
      scripts: NO_SCRIPTS,
      refresh,
    } as const;
  }
  const file = parseFcodeProjectFile(contents);
  if (file === null) {
    return { status: "invalid", file: null, scripts: NO_SCRIPTS, refresh } as const;
  }
  return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS, refresh } as const;
}
