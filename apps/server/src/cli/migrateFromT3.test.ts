// @effect-diagnostics nodeBuiltinImport:off - Builds a real SQLite database for the command to copy.
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { Command } from "effect/cli";

import * as ServerConfig from "../config.ts";
import { migrateFromT3Command } from "./migrateFromT3.ts";

describe("fcode migrate-from-t3", () => {
  it.effect("copies without --replace, and leaves fcode's data alone on a second run", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const t3Home = path.join(root, ".t3");
      const fcodeHome = path.join(root, ".fcode");
      const t3 = yield* ServerConfig.deriveServerPaths(t3Home, undefined);
      const fcode = yield* ServerConfig.deriveServerPaths(fcodeHome, undefined);
      yield* fs.makeDirectory(t3.stateDir, { recursive: true });
      const db = new NodeSqlite.DatabaseSync(t3.dbPath);
      db.exec("CREATE TABLE effect_sql_migrations (migration_id INTEGER, name TEXT)");
      db.close();
      yield* fs.writeFileString(t3.settingsPath, '{"from":"t3"}');
      const run = Command.runWith(migrateFromT3Command, { version: "0.0.0" });
      const args = ["--from", t3Home, "--base-dir", fcodeHome];

      yield* run(args);
      expect(yield* fs.readFileString(fcode.settingsPath)).toBe('{"from":"t3"}');

      yield* fs.writeFileString(fcode.settingsPath, '{"changed":true}');
      yield* run(args);
      expect(yield* fs.readFileString(fcode.settingsPath)).toBe('{"changed":true}');
    }).pipe(
      Effect.provide(NodeServices.layer),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
      Effect.scoped,
    ),
  );
});
