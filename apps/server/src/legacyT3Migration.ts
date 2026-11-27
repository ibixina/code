// @effect-diagnostics nodeBuiltinImport:off - SQLite's online backup copies a database a running T3 Code still writes.
import * as NodeSqlite from "node:sqlite";

import * as HostProcess from "@fcode/shared/HostProcess";
import * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as ServerConfig from "./config.ts";
import { expandHomePath, resolveBaseDir } from "./os-jank.ts";
import { migrationManifest } from "./persistence/Migrations.ts";

export class LegacyT3MigrationError extends Schema.TaggedError<LegacyT3MigrationError>()(
  "LegacyT3MigrationError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

/**
 * What moves from a T3 Code home. The database and `secrets` travel together: secret references in
 * threads are keyed by the salt in `secrets`. Identity, pairing sessions, logs, caches and the SSH
 * launcher id stay behind, so fcode is a separate install that other devices pair with anew.
 */
const STATE_ENTRIES = [
  "attachments",
  "browser-artifacts",
  "secrets",
  "server-browser",
  "themes",
  "settings.json",
  "keybindings.json",
  "keybindings-migrations",
  "client-settings.json",
] as const;
const HOME_ENTRIES = ["workflows"] as const;

const LATEST_KNOWN_MIGRATION = Math.max(...migrationManifest.map(([id]) => id));

const fail = (message: string) => (cause: unknown) =>
  new LegacyT3MigrationError({ message, cause });

/** The default T3 Code home: `T3CODE_HOME`, else `~/.t3`. */
export const resolveLegacyHome = Effect.fn("LegacyT3Migration.resolveLegacyHome")(function* (
  from?: string,
) {
  const path = yield* Path.Path;
  const configured = yield* Config.String("T3CODE_HOME").pipe(Config.option);
  const raw =
    from ??
    (Option.getOrUndefined(configured)?.trim() ||
      path.join(yield* HostProcess.HomeDirectory, ".t3"));
  return path.resolve(yield* expandHomePath(raw));
});

const latestMigration = (dbPath: string) =>
  Effect.try({
    try: () => {
      const db = new NodeSqlite.DatabaseSync(dbPath, { readOnly: true, timeout: 5_000 });
      try {
        const row = db.prepare("SELECT max(migration_id) AS id FROM effect_sql_migrations").get();
        return typeof row?.id === "number" ? row.id : 0;
      } finally {
        db.close();
      }
    },
    catch: fail(`Could not read the T3 Code database at ${dbPath}.`),
  });

// The online backup gives a consistent copy even while T3 Code is running and writing.
const backupDatabase = (from: string, to: string) =>
  Effect.tryPromise({
    try: async () => {
      const db = new NodeSqlite.DatabaseSync(from, { readOnly: true, timeout: 5_000 });
      try {
        await NodeSqlite.backup(db, to);
      } finally {
        db.close();
      }
    },
    catch: fail(`Could not copy the T3 Code database from ${from}.`),
  });

export interface LegacyT3MigrationResult {
  readonly copied: ReadonlyArray<string>;
  /** Where replaced fcode files were moved, when `replace` moved any. */
  readonly backupDir: string | null;
}

/**
 * Copies T3 Code's threads, projects, attachments and settings into an fcode home. Without
 * `replace`, anything fcode already has is kept. With it, fcode's versions move into a backup
 * folder first. The fcode server for `destinationHome` must not be running.
 */
export const migrateFromT3 = Effect.fn("LegacyT3Migration.migrateFromT3")(function* (input: {
  readonly sourceHome: string;
  readonly destinationHome: string;
  readonly replace: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* ServerConfig.deriveServerPaths(input.sourceHome, undefined);
  const destination = yield* ServerConfig.deriveServerPaths(input.destinationHome, undefined);
  if (path.resolve(source.stateDir) === path.resolve(destination.stateDir)) {
    return yield* new LegacyT3MigrationError({
      message: `The T3 Code and fcode data folders are the same (${source.stateDir}).`,
    });
  }
  if (!(yield* fs.exists(source.dbPath).pipe(Effect.orElseSucceed(() => false)))) {
    return yield* new LegacyT3MigrationError({
      message: `No T3 Code database found at ${source.dbPath}.`,
    });
  }
  const sourceMigration = yield* latestMigration(source.dbPath);
  if (sourceMigration > LATEST_KNOWN_MIGRATION) {
    return yield* new LegacyT3MigrationError({
      message: `T3 Code's database is newer than this fcode build understands (migration ${sourceMigration}, fcode knows up to ${LATEST_KNOWN_MIGRATION}). Update fcode first.`,
    });
  }

  const entries = [
    ...STATE_ENTRIES.map(
      (name) => [path.join(source.stateDir, name), path.join(destination.stateDir, name)] as const,
    ),
    ...HOME_ENTRIES.map(
      (name) =>
        [path.join(input.sourceHome, name), path.join(input.destinationHome, name)] as const,
    ),
  ];
  const dbFiles = ["", "-wal", "-shm"].map((suffix) => destination.dbPath + suffix);

  yield* fs.makeDirectory(destination.stateDir, { recursive: true });
  let backupDir: string | null = null;
  const moveAside = Effect.fn("LegacyT3Migration.moveAside")(function* (target: string) {
    if (!(yield* fs.exists(target))) return;
    if (backupDir === null) {
      const stamp = DateTime.formatIso(yield* DateTime.now).replace(/[:.]/g, "-");
      backupDir = path.join(destination.stateDir, `before-t3-import-${stamp}`);
      yield* fs.makeDirectory(backupDir, { recursive: true });
    }
    yield* fs.rename(target, path.join(backupDir, path.basename(target)));
  });

  const copied: string[] = [];
  const databaseExists = yield* fs.exists(destination.dbPath);
  if (input.replace || !databaseExists) {
    if (input.replace) yield* Effect.forEach(dbFiles, moveAside, { discard: true });
    const staged = `${destination.dbPath}.t3-import`;
    yield* fs.remove(staged, { force: true });
    yield* backupDatabase(source.dbPath, staged);
    yield* fs.rename(staged, destination.dbPath);
    copied.push(destination.dbPath);
  }
  for (const [from, to] of entries) {
    if (!(yield* fs.exists(from))) continue;
    if (yield* fs.exists(to)) {
      if (!input.replace) continue;
      yield* moveAside(to);
    }
    yield* fs.makeDirectory(path.dirname(to), { recursive: true });
    yield* fs.copy(from, to);
    copied.push(to);
  }
  return { copied, backupDir } satisfies LegacyT3MigrationResult;
});

/**
 * On the first start of the default fcode home, bring in an existing T3 Code install. Runs after the
 * server owns the home and before anything opens its database. `FCODE_SKIP_T3_MIGRATION=1` opts out.
 */
export const migrateOnFirstStart = Effect.fn("LegacyT3Migration.migrateOnFirstStart")(function* (
  config: Pick<ServerConfig.ServerConfig["Service"], "baseDir" | "devUrl" | "dbPath">,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skip = yield* Config.Boolean("FCODE_SKIP_T3_MIGRATION").pipe(Config.withDefault(false));
  if (skip || config.devUrl !== undefined) return;
  if (path.resolve(config.baseDir) !== path.resolve(yield* resolveBaseDir(undefined))) return;
  if (yield* fs.exists(config.dbPath)) return;
  const sourceHome = yield* resolveLegacyHome();
  const source = yield* ServerConfig.deriveServerPaths(sourceHome, undefined);
  if (!(yield* fs.exists(source.dbPath))) return;
  const result = yield* migrateFromT3({
    sourceHome,
    destinationHome: config.baseDir,
    replace: false,
  });
  yield* Effect.logInfo("Imported T3 Code data on first start.", {
    from: sourceHome,
    copied: result.copied.length,
  });
});
