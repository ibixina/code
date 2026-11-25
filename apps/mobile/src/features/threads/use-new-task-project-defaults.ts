import { resolveFilesystemReadAccess } from "@fcode/client-runtime/state/filesystem";
import { isScratchProject } from "@fcode/client-runtime/state/projects";
import type { EnvironmentProject } from "@fcode/client-runtime/state/shell";
import type { ProjectReadFileResult } from "@fcode/contracts";
import { DEFAULT_SERVER_SETTINGS, FCODE_PROJECT_FILE_NAME } from "@fcode/contracts";
import { resolveNewThreadEnvMode, resolveProjectSettings } from "@fcode/shared/projectSettings";
import { parseFcodeProjectFile } from "@fcode/shared/fcodeProjectFile";

import { m } from "../../i18n/messages";
import { useEnvironmentServerConfig } from "../../state/entities";
import { useEnvironmentPresentation } from "../../state/presentation";
import { useProjectHasThreads } from "../../state/project-has-threads";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { environmentSession } from "../../state/session";

/**
 * A project's new-task defaults: server settings merged with its fcode.json. The
 * new-task flow and the home pending-drafts list both read the default
 * workspace mode here, so a draft that never picked one shows what it sends.
 * Every read is a shared per-environment or per-project atom.
 */
export function useNewTaskProjectDefaults(project: EnvironmentProject | null) {
  const serverConfig = useEnvironmentServerConfig(project?.environmentId ?? null);
  const isScratch =
    project !== null && isScratchProject(project, serverConfig?.scratchWorkspaceRoot);
  const hasWorkspace = project !== null && project.workspaceRoot !== "";
  const fileAccessSession = useEnvironmentQuery(
    hasWorkspace ? environmentSession.sessionStateAtom(project.environmentId) : null,
  );
  const fileEnvironment = useEnvironmentPresentation(project?.environmentId ?? null);
  const fileAccess = resolveFilesystemReadAccess(
    {
      isCatalogReady: fileEnvironment.isReady,
      connection: fileEnvironment.presentation?.connection ?? null,
      session: fileAccessSession.data,
      sessionError: fileAccessSession.error,
    },
    m,
  );
  const fileAccessPending = hasWorkspace && fileAccess.isPending;
  const fcodeProjectFileQuery = useEnvironmentQuery(
    fileAccess.canReadFiles && hasWorkspace
      ? projectEnvironment.readFile({
          environmentId: project.environmentId,
          input: {
            cwd: project.workspaceRoot,
            relativePath: FCODE_PROJECT_FILE_NAME,
            allowMissing: true,
          },
        })
      : null,
  );
  const fcodeProjectFileData = fcodeProjectFileQuery.data as ProjectReadFileResult | null;
  const fcodeProjectFile =
    fcodeProjectFileData === null || fcodeProjectFileData.exists === false || fcodeProjectFileData.truncated
      ? null
      : parseFcodeProjectFile(fcodeProjectFileData.contents);
  const projectSettings = resolveProjectSettings(
    serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS,
    project?.id ?? null,
    project,
    fcodeProjectFile,
  );
  const projectHasThreads = useProjectHasThreads(project);
  const defaultWorkspaceMode = isScratch
    ? "local"
    : resolveNewThreadEnvMode({
        projectSettings,
        workspaceRoot: project?.workspaceRoot ?? null,
        newProjectsRoot: serverConfig?.newProjectsRoot,
        projectHasThreads,
      });
  // While fcode.json loads, the environment default is provisional; fcode.json may replace it.
  const defaultWorkspaceModeSettled =
    projectSettings.sources.defaultThreadEnvMode !== "environment" ||
    (!fcodeProjectFileQuery.isPending && !fileAccessPending);
  return {
    serverConfig,
    isScratch,
    projectSettings,
    defaultWorkspaceMode,
    defaultWorkspaceModeSettled,
  };
}
