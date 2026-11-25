import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import { migrateConfig } from "./migrateConfig.ts";

describe("migrateConfig", () => {
  it.effect("copies configuration without overwriting existing settings or importing state", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const legacyHome = path.join(root, ".t3");
      const fcodeHome = path.join(root, ".fcode");
      const legacy = yield* ServerConfig.deriveServerPaths(legacyHome, undefined);
      const current = yield* ServerConfig.deriveServerPaths(fcodeHome, undefined);

      expect(yield* migrateConfig(legacyHome, fcodeHome)).toEqual([]);
      expect(yield* fs.exists(current.stateDir)).toBe(false);

      yield* fs.makeDirectory(legacy.environmentThemesDir, { recursive: true });
      yield* fs.makeDirectory(current.stateDir, { recursive: true });
      yield* fs.writeFileString(legacy.settingsPath, '{"defaultTheme":"custom"}');
      yield* fs.writeFileString(current.settingsPath, '{"defaultTheme":"existing"}');
      yield* fs.writeFileString(legacy.keybindingsConfigPath, "[]");
      yield* fs.writeFileString(path.join(legacy.environmentThemesDir, "custom.json"), "{}");
      yield* fs.writeFileString(legacy.dbPath, "database");
      yield* fs.writeFileString(path.join(legacy.stateDir, "anonymous-id"), "old-id");

      const theme = path.join(current.environmentThemesDir, "custom.json");
      expect(yield* migrateConfig(legacyHome, fcodeHome)).toEqual([
        current.keybindingsConfigPath,
        theme,
      ]);
      expect(yield* fs.readFileString(current.keybindingsConfigPath)).toBe("[]");
      expect(yield* fs.readFileString(theme)).toBe("{}");
      expect(yield* fs.readFileString(current.settingsPath)).toBe('{"defaultTheme":"existing"}');
      expect(yield* fs.readFileString(legacy.settingsPath)).toBe('{"defaultTheme":"custom"}');
      expect(yield* fs.exists(current.dbPath)).toBe(false);
      expect(yield* fs.exists(path.join(current.stateDir, "anonymous-id"))).toBe(false);
      expect(yield* migrateConfig(legacyHome, fcodeHome)).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
