// @effect-diagnostics nodeBuiltinImport:off - Builds real SQLite fixtures for the online backup.
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as HostProcess from "@fcode/shared/HostProcess";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ServerConfig from "./config.ts";
import { migrateFromT3, migrateOnFirstStart } from "./legacyT3Migration.ts";
import { migrationManifest } from "./persistence/Migrations.ts";

const latest = Math.max(...migrationManifest.map(([id]) => id));

const writeDatabase = (dbPath: string, thread: string, migrationId = latest - 1) => {
  const db = new NodeSqlite.DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("CREATE TABLE effect_sql_migrations (migration_id INTEGER, name TEXT)");
    db.prepare("INSERT INTO effect_sql_migrations VALUES (?, 'x')").run(migrationId);
    db.exec("CREATE TABLE threads (title TEXT)");
    db.prepare("INSERT INTO threads VALUES (?)").run(thread);
  } finally {
    db.close();
  }
};

const readThread = (dbPath: string) => {
  const db = new NodeSqlite.DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare("SELECT title FROM threads").get()?.title;
  } finally {
    db.close();
  }
};

const homes = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const t3Home = path.join(root, ".t3");
  const fcodeHome = path.join(root, ".fcode");
  const t3 = yield* ServerConfig.deriveServerPaths(t3Home, undefined);
  const fcode = yield* ServerConfig.deriveServerPaths(fcodeHome, undefined);
  yield* fs.makeDirectory(path.join(t3.secretsDir), { recursive: true });
  yield* fs.makeDirectory(t3.attachmentsDir, { recursive: true });
  writeDatabase(t3.dbPath, "from t3");
  yield* fs.writeFileString(path.join(t3.secretsDir, "secret-request-salt.bin"), "t3 salt");
  yield* fs.writeFileString(path.join(t3.attachmentsDir, "a.png"), "image");
  yield* fs.writeFileString(t3.settingsPath, '{"from":"t3"}');
  yield* fs.writeFileString(t3.environmentIdPath, "t3-environment");
  return { root, t3Home, fcodeHome, t3, fcode };
});

describe("migrateFromT3", () => {
  it.effect("copies threads, secrets, attachments, and settings into a fresh fcode home", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { t3Home, fcodeHome, t3, fcode } = yield* homes;

      const result = yield* migrateFromT3({
        sourceHome: t3Home,
        destinationHome: fcodeHome,
        replace: false,
      });

      expect(result.backupDir).toBeNull();
      expect(readThread(fcode.dbPath)).toBe("from t3");
      expect(yield* fs.readFileString(path.join(fcode.secretsDir, "secret-request-salt.bin"))).toBe(
        "t3 salt",
      );
      expect(yield* fs.readFileString(path.join(fcode.attachmentsDir, "a.png"))).toBe("image");
      expect(yield* fs.readFileString(fcode.settingsPath)).toBe('{"from":"t3"}');
      // fcode is its own environment: other devices pair with it anew.
      expect(yield* fs.exists(fcode.environmentIdPath)).toBe(false);
      expect(readThread(t3.dbPath)).toBe("from t3");
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.effect("keeps fcode's data unless asked to replace it, then backs it up first", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { t3Home, fcodeHome, fcode } = yield* homes;
      yield* fs.makeDirectory(fcode.stateDir, { recursive: true });
      writeDatabase(fcode.dbPath, "from fcode");
      yield* fs.writeFileString(fcode.settingsPath, '{"from":"fcode"}');

      const kept = yield* migrateFromT3({
        sourceHome: t3Home,
        destinationHome: fcodeHome,
        replace: false,
      });
      expect(kept.copied).not.toContain(fcode.dbPath);
      expect(readThread(fcode.dbPath)).toBe("from fcode");
      expect(yield* fs.readFileString(fcode.settingsPath)).toBe('{"from":"fcode"}');

      const replaced = yield* migrateFromT3({
        sourceHome: t3Home,
        destinationHome: fcodeHome,
        replace: true,
      });
      expect(readThread(fcode.dbPath)).toBe("from t3");
      expect(yield* fs.readFileString(fcode.settingsPath)).toBe('{"from":"t3"}');
      const backup = replaced.backupDir!;
      expect(readThread(path.join(backup, "statev2.sqlite"))).toBe("from fcode");
      expect(yield* fs.readFileString(path.join(backup, "settings.json"))).toBe('{"from":"fcode"}');
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.effect("refuses a T3 Code database newer than this build", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { t3Home, fcodeHome, t3, fcode } = yield* homes;
      yield* fs.remove(t3.dbPath);
      writeDatabase(t3.dbPath, "from the future", latest + 1);

      const exit = yield* Effect.exit(
        migrateFromT3({ sourceHome: t3Home, destinationHome: fcodeHome, replace: false }),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(yield* fs.exists(fcode.dbPath)).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
});

describe("migrateOnFirstStart", () => {
  it.effect("imports only into the default home, and only before it has a database", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { root, fcodeHome, fcode } = yield* homes;
      const start = (baseDir: string, devUrl?: URL) =>
        ServerConfig.deriveServerPaths(baseDir, devUrl).pipe(
          Effect.flatMap(({ dbPath }) => migrateOnFirstStart({ baseDir, devUrl, dbPath })),
          Effect.provideService(HostProcess.HomeDirectory, root),
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
        );

      yield* start(path.join(root, "elsewhere"));
      expect(yield* fs.exists(path.join(root, "elsewhere"))).toBe(false);
      yield* start(fcodeHome, new URL("http://localhost:5733"));
      expect(yield* fs.exists(fcode.dbPath)).toBe(false);

      yield* start(fcodeHome);
      expect(readThread(fcode.dbPath)).toBe("from t3");

      yield* fs.writeFileString(fcode.settingsPath, '{"changed":true}');
      yield* start(fcodeHome);
      expect(yield* fs.readFileString(fcode.settingsPath)).toBe('{"changed":true}');
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
});
