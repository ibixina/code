import * as HostProcess from "@fcode/shared/HostProcess";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Command, Flag } from "effect/cli";

import * as ServerConfig from "../config.ts";
import { expandHomePath, resolveBaseDir } from "../os-jank.ts";
import { baseDirFlag } from "./config.ts";

const copyConfigFile = Effect.fn("ConfigMigration.copyConfigFile")(function* (
  source: string,
  destination: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const info = yield* fs.stat(source).pipe(
    Effect.catchIf(
      (error) => error.reason._tag === "NotFound",
      () => Effect.undefined,
    ),
  );
  if (info?.type !== "File" || (yield* fs.exists(destination))) return false;

  const directory = path.dirname(destination);
  yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
  // Publish the completed file without replacing a file created by another process.
  const staged = yield* fs.makeTempFileScoped({ directory, prefix: ".migrate-" });
  yield* fs.writeFile(staged, yield* fs.readFile(source), { mode: 0o600 });
  yield* fs.chmod(staged, 0o600);
  return yield* fs.link(staged, destination).pipe(
    Effect.as(true),
    Effect.catchIf(
      (error) => error.reason._tag === "AlreadyExists",
      () => Effect.succeed(false),
    ),
  );
}, Effect.scoped);

export const migrateConfig = Effect.fn("ConfigMigration.migrateConfig")(function* (
  sourceHome: string,
  destinationHome: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* ServerConfig.deriveServerPaths(sourceHome, undefined);
  const destination = yield* ServerConfig.deriveServerPaths(destinationHome, undefined);
  const copied: string[] = [];
  const files = [
    [source.settingsPath, destination.settingsPath],
    [source.keybindingsConfigPath, destination.keybindingsConfigPath],
  ] as const;
  for (const [from, to] of files) {
    if (yield* copyConfigFile(from, to)) copied.push(to);
  }

  const themeFiles = yield* fs.readDirectory(source.environmentThemesDir).pipe(
    Effect.catchIf(
      (error) => error.reason._tag === "NotFound",
      () => Effect.succeed([]),
    ),
  );
  for (const name of themeFiles.sort()) {
    if (!name.endsWith(".json")) continue;
    const to = path.join(destination.environmentThemesDir, name);
    if (yield* copyConfigFile(path.join(source.environmentThemesDir, name), to)) copied.push(to);
  }
  return copied;
});

export const migrateConfigCommand = Command.make("migrate-config", {
  from: Flag.String("from").pipe(
    Flag.withDescription("T3 Code data directory (defaults to T3CODE_HOME or ~/.t3)."),
    Flag.optional,
  ),
  baseDir: baseDirFlag,
}).pipe(
  Command.withDescription("Copy T3 Code settings, keybindings, and custom themes into fcode."),
  Command.withHandler(({ from, baseDir }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const home = yield* HostProcess.HomeDirectory;
      const legacyHome = yield* Config.String("T3CODE_HOME").pipe(Config.option);
      const fcodeHome = yield* Config.String("FCODE_HOME").pipe(Config.option);
      const source = path.resolve(
        yield* expandHomePath(
          Option.getOrUndefined(from) ??
            (Option.getOrUndefined(legacyHome)?.trim() || path.join(home, ".t3")),
        ),
      );
      const destination = yield* resolveBaseDir(
        Option.getOrUndefined(baseDir) ?? Option.getOrUndefined(fcodeHome),
      );
      const copied = yield* migrateConfig(source, destination);
      yield* Console.log(
        copied.length === 0
          ? `No new configuration files to copy from ${source}.`
          : `Copied ${copied.length} configuration file(s) to ${destination}.`,
      );
    }),
  ),
);
