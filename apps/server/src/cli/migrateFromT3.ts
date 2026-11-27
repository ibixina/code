import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/cli";

import * as ServerConfig from "../config.ts";
import { migrateFromT3, resolveLegacyHome } from "../legacyT3Migration.ts";
import { resolveBaseDir } from "../os-jank.ts";
import * as ServerOwnership from "../serverOwnership.ts";
import * as CliError from "effect/cli/CliError";
import { baseDirFlag } from "./config.ts";

export const migrateFromT3Command = Command.make("migrate-from-t3", {
  from: Flag.String("from").pipe(
    Flag.withDescription("T3 Code data directory (defaults to T3CODE_HOME or ~/.t3)."),
    Flag.optional,
  ),
  baseDir: baseDirFlag,
  replace: Flag.Boolean("replace").pipe(
    Flag.withDescription(
      "Replace fcode's threads and settings with T3 Code's, moving fcode's current ones to a backup folder.",
    ),
    Flag.withDefault(false),
  ),
}).pipe(
  Command.withDescription(
    "Copy T3 Code's threads, projects, attachments, and settings into fcode. T3 Code is left untouched.",
  ),
  Command.withHandler(({ from, baseDir, replace }) =>
    Effect.gen(function* () {
      const fcodeHome = yield* Config.String("FCODE_HOME").pipe(Config.option);
      const sourceHome = yield* resolveLegacyHome(Option.getOrUndefined(from));
      const destinationHome = yield* resolveBaseDir(
        Option.getOrUndefined(baseDir) ?? Option.getOrUndefined(fcodeHome),
      );
      const paths = yield* ServerConfig.deriveServerPaths(destinationHome, undefined);
      // Holding the lock refuses a running fcode and keeps one from starting mid-copy.
      yield* ServerOwnership.holdServerOwnershipLock(paths.serverRuntimeStatePath).pipe(
        Effect.catchTags({
          ServerAlreadyRunningError: () =>
            Effect.fail(
              new CliError.UserError({
                cause: `fcode is running for ${destinationHome}. Quit the fcode app (and stop \`fcode serve\` or the background service), then run this again.`,
              }),
            ),
        }),
      );
      const result = yield* migrateFromT3({ sourceHome, destinationHome, replace }).pipe(
        Effect.mapError((error) => new CliError.UserError({ cause: error.message })),
      );
      if (result.copied.length === 0) {
        yield* Console.log(
          `Nothing new to copy from ${sourceHome}. Pass --replace to replace fcode's data with T3 Code's.`,
        );
        return;
      }
      yield* Console.log(
        `Copied ${result.copied.length} item(s) from ${sourceHome} to ${destinationHome}.`,
      );
      if (result.backupDir !== null) {
        yield* Console.log(`fcode's previous data is in ${result.backupDir}.`);
      }
    }).pipe(Effect.scoped),
  ),
);
