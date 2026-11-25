import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { ThreadEnvMode, WorktreeSubmodules } from "./environment.ts";
import { ProjectScriptIcon } from "./project.ts";
import type { ProjectScopedServerSettingKey, ServerSettings } from "./settings.ts";

export const FCODE_PROJECT_FILE_NAME = "fcode.json";

export const FCODE_PROJECT_FILE_SCHEMA_URL = "https://t3.codes/schema/fcode.json";

const FCODE_PROJECT_FILE_PATH_MAX_LENGTH = 512;
const FCODE_PROJECT_FILE_COMMAND_MAX_LENGTH = 4096;
const FCODE_PROJECT_FILE_MAX_SCRIPTS = 50;

// Encoded-side annotations survive into JSON Schema; decoding still trims and rejects empty strings.
const trimmedNonEmpty = (annotations: { readonly description: string }, maxLength?: number) => {
  const annotated = Schema.String.annotate(annotations);
  const encoded =
    maxLength === undefined
      ? annotated.check(Schema.isNonEmpty())
      : annotated.check(Schema.isNonEmpty(), Schema.isMaxLength(maxLength));
  return encoded.pipe(Schema.decodeTo(encoded, SchemaTransformation.trim()));
};

export const FcodeProjectFileScript = Schema.Struct({
  name: trimmedNonEmpty({
    description: "Display name for the script, shown in the fcode scripts menu.",
  }),
  command: trimmedNonEmpty({
    description: "Shell command executed in a fcode terminal at the project root.",
  }),
  icon: Schema.optionalKey(
    ProjectScriptIcon.annotate({
      description: 'Icon shown next to the script in the scripts menu. Defaults to "play".',
    }),
  ),
  runOnWorktreeCreate: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, the script runs automatically after a worktree is created for a new thread.",
    }),
  ),
  runOnSettle: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, the script runs in the thread's worktree each time the thread settles, for example to delete build output. Threads without their own worktree skip it.",
    }),
  ),
  stopOnSettle: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, fcode stops this action's terminal and child processes when its thread settles.",
    }),
  ),
  async: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "Only for runOnWorktreeCreate scripts. When true (the default), the agent starts while the script is still running. Set false to hold the agent until the script exits.",
    }),
  ),
  previewUrl: Schema.optionalKey(
    trimmedNonEmpty({
      description:
        "URL opened in the in-app browser preview when this script runs. Only honored on the desktop build.",
    }),
  ),
  autoOpenPreview: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "When true, automatically open the preview panel at `previewUrl` the moment the script starts.",
    }),
  ),
}).annotate({
  description: "A project script that team members can import into fcode.",
});
export type FcodeProjectFileScript = typeof FcodeProjectFileScript.Type;

export const FcodeProjectFile = Schema.Struct({
  $schema: Schema.optionalKey(
    Schema.String.annotate({
      description: `URL of the JSON Schema for this file, typically "${FCODE_PROJECT_FILE_SCHEMA_URL}".`,
    }),
  ),
  iconPath: Schema.optionalKey(
    trimmedNonEmpty(
      {
        description:
          'Workspace-relative path to the project icon (e.g. "assets/logo.svg"). Checked before fcode\'s built-in icon locations.',
      },
      FCODE_PROJECT_FILE_PATH_MAX_LENGTH,
    ),
  ),
  defaultThreadEnvMode: Schema.optionalKey(
    ThreadEnvMode.annotate({
      description:
        'Where new threads start for this repository: "worktree" for a fresh git worktree, "local" for the current checkout. A per-project setting in fcode overrides this; when neither is set, the global default applies.',
    }),
  ),
  worktreeSubmodules: Schema.optionalKey(
    WorktreeSubmodules.annotate({
      description:
        'How new worktrees populate git submodules: "recursive" (the default) initializes nested submodules too, "top-level" initializes only those declared by this repository, and "none" leaves every submodule empty for a setup script to handle. A project or environment setting in fcode overrides this.',
    }),
  ),
  ignoreRepositories: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description:
        "Repositories inside the project folder that fcode should leave out of the project, as paths relative to it, such as vendor/big. They are then neither reviewed on their own nor given worktrees.",
    }),
  ),
  worktreeLayout: Schema.optionalKey(
    Schema.Struct({
      create: trimmedNonEmpty(
        {
          description:
            "Shell command that lays out a thread's folder for a project tracking several repositories, in place of fcode's own worktrees and links. It runs in the project folder with FCODE_WORKTREE_ROOT (the folder to fill), FCODE_WORKTREE_PROJECT_PATH (where the project folder goes inside it), FCODE_WORKTREE_BRANCH, FCODE_WORKTREE_BASE, FCODE_WORKTREE_REPOSITORIES (the chosen repositories, one path per line) and FCODE_PROJECT_ROOT set. Each of the project's repositories it checks out at the same relative place is adopted as the thread's checkout of it, and must be a git worktree of that repository on FCODE_WORKTREE_BRANCH. It runs again when the folder goes missing, so it must cope with the branch already existing. It has ten minutes.",
        },
        FCODE_PROJECT_FILE_COMMAND_MAX_LENGTH,
      ),
      remove: Schema.optionalKey(
        trimmedNonEmpty(
          {
            description:
              "Shell command that takes the thread's folder down again, with the same variables. It can run on a folder that is partly gone, and should delete what create generated. fcode removes the checkouts it leaves behind.",
          },
          FCODE_PROJECT_FILE_COMMAND_MAX_LENGTH,
        ),
      ),
    }).annotate({
      description:
        "Lets the project create and remove a worktree thread's folder itself, for layouts with shared build output or workspace metadata.",
    }),
  ),
  worktreeSparsePatternsPath: Schema.optionalKey(
    trimmedNonEmpty(
      {
        description:
          'Repository-relative path to a git sparse-checkout pattern file in non-cone syntax (e.g. ".fcode/sparse-checkout"). New worktrees check out only the files it matches. Both files are read from the branch being checked out; a missing pattern file fails the worktree instead of checking out everything.',
      },
      FCODE_PROJECT_FILE_PATH_MAX_LENGTH,
    ),
  ),
  scripts: Schema.optionalKey(
    Schema.Array(FcodeProjectFileScript)
      .annotate({
        description: "Project scripts shared with everyone who opens this repository in fcode.",
      })
      .check(Schema.isMaxLength(FCODE_PROJECT_FILE_MAX_SCRIPTS)),
  ),
}).annotate({
  title: "fcode project file",
  description:
    "Checked-in project configuration for fcode (fcode.json at the repository root). See https://t3.codes for documentation.",
});
export type FcodeProjectFile = typeof FcodeProjectFile.Type;

/** Keys must be nullable in ServerSettings so both environment and project overrides can inherit fcode.json. */
export const PROJECT_FILE_BACKED_SETTINGS = {
  defaultThreadEnvMode: { field: "defaultThreadEnvMode", builtIn: "local" },
  worktreeSubmodules: { field: "worktreeSubmodules", builtIn: "recursive" },
} as const satisfies {
  // providerInstances overrides individual fields, so it cannot use whole-setting file inheritance.
  readonly [K in ProjectScopedServerSettingKey & keyof ServerSettings]?: {
    readonly field: {
      readonly [F in keyof FcodeProjectFile]: FcodeProjectFile[F] extends
        | Exclude<ServerSettings[K], null>
        | undefined
        ? F
        : never;
    }[keyof FcodeProjectFile];
    readonly builtIn: Exclude<ServerSettings[K], null>;
  };
};
export type ProjectFileBackedSettingKey = keyof typeof PROJECT_FILE_BACKED_SETTINGS;

export type ResolvedServerSettings = Omit<ServerSettings, ProjectFileBackedSettingKey> & {
  readonly [K in ProjectFileBackedSettingKey]: Exclude<ServerSettings[K], null>;
};
