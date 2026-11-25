import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { FCODE_PROJECT_FILE_NAME, type FcodeProjectFile } from "@fcode/contracts";
import { FcodeProjectFileFromJson } from "@fcode/shared/fcodeProjectFile";

const decodeFcodeProjectFileJson = Schema.decodeEffect(FcodeProjectFileFromJson);

export class FcodeProjectFileLoadError extends Schema.TaggedError<FcodeProjectFileLoadError>()(
  "FcodeProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${FCODE_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

export class FcodeProjectFileLoader extends Context.Service<
  FcodeProjectFileLoader,
  {
    /** Never fails; missing/unreadable/invalid files return none, with warnings for invalid files. */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<FcodeProjectFile>>;
  }
>()("fcode/project/FcodeProjectFileLoader") {}

const logFcodeProjectFileLoadError = (error: FcodeProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** @public */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: FcodeProjectFileLoader["Service"]["load"] = Effect.fn("FcodeProjectFileLoader.load")(
    function* (workspaceRoot) {
      const filePath = path.join(workspaceRoot, FCODE_PROJECT_FILE_NAME);
      const raw = yield* fileSystem.readFileString(filePath).pipe(
        Effect.asSome,
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(Option.none<string>())
              : logFcodeProjectFileLoadError(
                  new FcodeProjectFileLoadError({
                    operation: "read",
                    workspaceRoot,
                    filePath,
                    cause: error,
                  }),
                ).pipe(Effect.as(Option.none<string>())),
        }),
      );
      if (Option.isNone(raw)) {
        return Option.none<FcodeProjectFile>();
      }
      return yield* decodeFcodeProjectFileJson(raw.value).pipe(
        Effect.asSome,
        Effect.catchTags({
          SchemaError: (error) =>
            logFcodeProjectFileLoadError(
              new FcodeProjectFileLoadError({
                operation: "decode",
                workspaceRoot,
                filePath,
                cause: error,
              }),
            ).pipe(Effect.as(Option.none<FcodeProjectFile>())),
        }),
      );
    },
  );

  return FcodeProjectFileLoader.of({ load });
});

export const layer = Layer.effect(FcodeProjectFileLoader, make);
