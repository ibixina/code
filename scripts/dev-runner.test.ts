// @effect-diagnostics nodeBuiltinImport:off - builds real worktree layouts on disk.
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NetService from "@fcode/shared/Net";
import * as HostProcess from "@fcode/shared/HostProcess";
import { assert, describe, it } from "@effect/vitest";
import * as ByteSize from "effect/ByteSize";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import {
  checkPortAvailabilityOnHosts,
  createDevRunnerEnv,
  findFirstAvailableOffset,
  resolveModePortOffsets,
  runDevRunnerWithInput,
} from "./dev-runner.ts";

const emptyConfigLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
const netServiceLayer = Layer.succeed(NetService.NetService, {
  canListenOnHost: () => Effect.succeed(true),
  isPortAvailableOnLoopback: () => Effect.succeed(true),
  hasListenerOnHost: () => Effect.succeed(false),
  reserveLoopbackPort: () => Effect.succeed(49_152),
  findAvailablePort: (port) => Effect.succeed(port),
});

function mockProcess(exit: number | PlatformError.PlatformError) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode:
      typeof exit === "number"
        ? Effect.succeed(ChildProcessSpawner.ExitCode(exit))
        : Effect.fail(exit),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const devServerInput = {
  mode: "dev:server",
  fcodeHome: "/tmp/fcode-dev-runner",
  browser: undefined,
  autoBootstrapProjectFromCwd: undefined,
  logWebSocketEvents: undefined,
  host: undefined,
  port: 13_773,
  devUrl: undefined,
  dryRun: false,
  share: false,
  built: false,
  runArgs: ["--inspect", "secret-token-value"],
} as const;

it.layer(NodeServices.layer)("dev-runner", (it) => {
  describe("createDevRunnerEnv", () => {
    it.effect("forwards the reusable auth token to web dev and removes it for desktop", () =>
      Effect.gen(function* () {
        const input = {
          baseEnv: { FCODE_DEV_AUTH_TOKEN: "reusable-dev-auth-token-that-is-long-enough" },
          serverOffset: 0,
          webOffset: 0,
          fcodeHome: undefined,
          browser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        } as const;
        const web = yield* createDevRunnerEnv({ ...input, mode: "dev" });
        const desktop = yield* createDevRunnerEnv({ ...input, mode: "dev:desktop" });

        assert.equal(web.FCODE_DEV_AUTH_TOKEN, input.baseEnv.FCODE_DEV_AUTH_TOKEN);
        assert.equal(desktop.FCODE_DEV_AUTH_TOKEN, undefined);
      }),
    );

    it.effect("strips inherited service-launcher context", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {
            FCODE_SERVICE_LAUNCHER_CONTEXT: '{"childVersion":"9.9.9"}',
            FCODE_BOOT_SERVICE_UNIT: "fcode.service",
          },
          serverOffset: 0,
          webOffset: 0,
          fcodeHome: undefined,
          browser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.FCODE_SERVICE_LAUNCHER_CONTEXT, undefined);
        assert.equal(env.FCODE_BOOT_SERVICE_UNIT, undefined);
      }),
    );

    it.effect.each(["dev", "dev:web"] as const)(
      "leaves the client backend URLs unset in %s mode",
      (mode) =>
        Effect.gen(function* () {
          const env = yield* createDevRunnerEnv({
            mode,
            baseEnv: {
              VITE_HTTP_URL: "http://localhost:1234",
              VITE_WS_URL: "ws://localhost:1234",
            },
            serverOffset: 0,
            webOffset: 0,
            fcodeHome: undefined,
            browser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: undefined,
            devUrl: undefined,
          });

          assert.equal(env.VITE_HTTP_URL, undefined);
          assert.equal(env.VITE_WS_URL, undefined);
          assert.equal(env.FCODE_PORT, "13773");
          assert.equal(env.FCODE_SINGLE_ORIGIN_DEV, "1");
        }),
    );

    it.effect.each(["dev", "dev:web"] as const)("drops an inherited HOST in %s mode", (mode) =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode,
          baseEnv: { HOST: "0.0.0.0" },
          serverOffset: 0,
          webOffset: 0,
          fcodeHome: undefined,
          browser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.HOST, undefined);
      }),
    );

    it.effect("drops an inherited FCODE_HOST and FCODE_LAN from a parent fcode server", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: { FCODE_PORT: "3773", FCODE_HOST: "0.0.0.0", FCODE_LAN: "true" },
          serverOffset: 0,
          webOffset: 0,
          fcodeHome: undefined,
          browser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.FCODE_PORT, "13773");
        assert.equal(env.FCODE_HOST, undefined);
        assert.equal(env.FCODE_LAN, undefined);
      }),
    );
  });

  describe("cli", () => {
    it("ignores the parent fcode server's FCODE_PORT and FCODE_HOST", () => {
      const result = NodeChildProcess.spawnSync(
        process.execPath,
        ["scripts/dev-runner.ts", "dev:server", "--dry-run"],
        {
          cwd: NodePath.resolve(import.meta.dirname, ".."),
          encoding: "utf8",
          env: {
            ...process.env,
            FCODE_PORT: "3773",
            FCODE_HOST: "0.0.0.0",
          },
        },
      );

      assert.equal(result.status, 0, result.stderr);
      const output = `${result.stdout}${result.stderr}`;
      assert.match(output, /serverPort=\d+ /);
      assert.notMatch(output, /serverPort=3773 /);
    });
  });

  describe("findFirstAvailableOffset", () => {
    it.effect("advances until all required ports are available", () =>
      Effect.gen(function* () {
        const taken = new Set([13773, 5733, 13774, 5734]);
        const offset = yield* findFirstAvailableOffset({
          startOffset: 0,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.equal(offset, 2);
      }),
    );

    it.effect("skips browser-blocked web ports before probing availability", () =>
      Effect.gen(function* () {
        const probed: Array<{ port: number; role: string | undefined }> = [];
        const offset = yield* findFirstAvailableOffset({
          // 5733 + 833 = 6566, which browsers block as sane-port.
          startOffset: 833,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: (port, role) => {
            probed.push({ port, role });
            return Effect.succeed(true);
          },
        });

        assert.equal(offset, 834);
        assert.deepStrictEqual(probed, [
          { port: 14_607, role: "server" },
          { port: 6567, role: "web" },
        ]);
      }),
    );

    it.effect("does not reject a server-only offset because its unused web port is blocked", () =>
      Effect.gen(function* () {
        const offset = yield* findFirstAvailableOffset({
          startOffset: 833,
          requireServerPort: true,
          requireWebPort: false,
          checkPortAvailability: () => Effect.succeed(true),
        });

        assert.equal(offset, 833);
      }),
    );
  });

  describe("checkPortAvailabilityOnHosts", () => {
    it.effect("checks overlapping hosts sequentially to avoid self-interference", () =>
      Effect.gen(function* () {
        let inFlightCount = 0;
        const calls: Array<[number, string]> = [];

        const available = yield* checkPortAvailabilityOnHosts(
          13_773,
          ["127.0.0.1", "0.0.0.0", "::"],
          (port, host) =>
            Effect.promise(async () => {
              calls.push([port, host]);
              inFlightCount += 1;
              const overlapped = inFlightCount > 1;
              await Promise.resolve();
              inFlightCount -= 1;
              return !overlapped;
            }),
        );

        assert.equal(available, true);
        assert.deepStrictEqual(calls, [
          [13_773, "127.0.0.1"],
          [13_773, "0.0.0.0"],
          [13_773, "::"],
        ]);
      }),
    );
  });

  describe("devPortProbeHosts", () => {
    it.effect("passes the port role so only the server port sees the bind host", () =>
      Effect.gen(function* () {
        const probed: Array<{ port: number; role: string | undefined }> = [];

        yield* resolveModePortOffsets({
          mode: "dev",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port, role) => {
            probed.push({ port, role });
            return Effect.succeed(true);
          },
        });

        assert.deepStrictEqual(probed, [
          { port: 13_773, role: "server" },
          { port: 5733, role: "web" },
        ]);
      }),
    );
  });

  describe("resolveModePortOffsets", () => {
    it.effect("uses a shared fallback offset for dev mode", () =>
      Effect.gen(function* () {
        const taken = new Set([13773, 5733]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 1, webOffset: 1 });
      }),
    );

    it.effect("keeps server offset stable for dev:web and only shifts web offset", () =>
      Effect.gen(function* () {
        const taken = new Set([5733]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:web",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 0, webOffset: 1 });
      }),
    );

    it.effect("shifts only server offset for dev:server", () =>
      Effect.gen(function* () {
        const taken = new Set([13773]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:server",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 1, webOffset: 1 });
      }),
    );

    it.effect("respects explicit dev-url override for dev:web", () =>
      Effect.gen(function* () {
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:web",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: true,
          checkPortAvailability: () => Effect.succeed(false),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 0, webOffset: 0 });
      }),
    );
  });

  describe("runDevRunnerWithInput", () => {
    it.effect("preserves process spawn context and the exact platform cause", () => {
      const cause = PlatformError.systemError({
        _tag: "NotFound",
        module: "ChildProcess",
        method: "spawn",
        description: "vp was not found",
      });
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.fail(cause)),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput(devServerInput).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerProcessError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.operation, "spawn");
        assert.equal(error.mode, "dev:server");
        assert.equal(error.executable, "vp");
        assert.equal(error.argumentCount, 5);
        assert.equal(error.shell, false);
        assert.equal(error.cause, cause);
        assert.ok(!error.message.includes(cause.message));
        assert.notProperty(error, "args");
        assert.notInclude(error.message, "secret-token-value");
      });
    });

    it.effect.each([
      { built: "release", cargoFails: false, expectBuild: false },
      { built: "debug", cargoFails: false, expectBuild: false },
      { built: undefined, cargoFails: false, expectBuild: true },
      { built: undefined, cargoFails: true, expectBuild: true },
    ] as const)(
      "builds the resource monitor only when it is missing: built=$built cargoFails=$cargoFails",
      ({ built, cargoFails, expectBuild }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const spawned: Array<{ readonly command: string; readonly args: ReadonlyArray<string> }> =
            [];
          const warnings: Array<string> = [];
          const spawnerLayer = Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make((command) => {
              const spawn = command as unknown as {
                readonly command: string;
                readonly args: ReadonlyArray<string>;
              };
              spawned.push({ command: spawn.command, args: spawn.args });
              return spawn.command === "cargo" && cargoFails
                ? Effect.succeed(mockProcess(101))
                : Effect.succeed(mockProcess(0));
            }),
          );

          yield* runDevRunnerWithInput(devServerInput).pipe(
            Effect.provide([
              emptyConfigLayer,
              netServiceLayer,
              spawnerLayer,
              Logger.layer([
                Logger.make((options) => {
                  if (options.logLevel === "Warn") warnings.push(String(options.message));
                }),
              ]),
            ]),
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              exists: (file) =>
                NodePath.basename(file) === "fcode-resource-monitor"
                  ? Effect.succeed(
                      built !== undefined && NodePath.basename(NodePath.dirname(file)) === built,
                    )
                  : fs.exists(file),
            }),
            Effect.provideService(HostProcess.Platform, "linux"),
          );

          const cargo = spawned.filter((spawn) => spawn.command === "cargo");
          assert.lengthOf(cargo, expectBuild ? 1 : 0);
          if (expectBuild) {
            assert.includeMembers([...cargo[0]!.args], ["build", "--locked", "--release"]);
            assert.isTrue(cargo[0]!.args.at(-1)!.endsWith("Cargo.toml"));
          }
          assert.lengthOf(warnings, cargoFails ? 1 : 0);
          if (cargoFails) assert.include(warnings[0]!, "vp run build:resource-monitor");
          // A failed build never blocks dev.
          assert.equal(spawned.at(-1)?.command, "vp");
        }),
    );

    it.effect("ignores an ambient FCODE_HOME when no home is resolved", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: { FCODE_HOME: "/home/user/.fcode" },
          serverOffset: 0,
          webOffset: 0,
          fcodeHome: undefined,
          browser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.FCODE_HOME, undefined);
      }),
    );

    it.effect("expands a home-relative fcode home the way the server does", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const homeFor = (fcodeHome: string) =>
          createDevRunnerEnv({
            mode: "dev",
            baseEnv: {},
            serverOffset: 0,
            webOffset: 0,
            fcodeHome,
            browser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: undefined,
            devUrl: undefined,
          }).pipe(
            Effect.provideService(HostProcess.HomeDirectory, "/home/dev"),
            Effect.map((env) => env.FCODE_HOME),
          );

        assert.equal(yield* homeFor("~/fcode-dev"), path.join("/home/dev", "fcode-dev"));
        assert.equal(yield* homeFor("~"), "/home/dev");
        assert.equal(yield* homeFor("~\\fcode-dev"), path.join("/home/dev", "fcode-dev"));
        assert.equal(yield* homeFor("  ~/fcode-dev  "), path.join("/home/dev", "fcode-dev"));
        assert.equal(yield* homeFor("~someone/fcode-dev"), path.resolve("~someone/fcode-dev"));
        assert.equal(yield* homeFor("relative/fcode-dev"), path.resolve("relative/fcode-dev"));
        assert.equal(yield* homeFor("/tmp/fcode-dev"), path.resolve("/tmp/fcode-dev"));
        // An explicit ~/.fcode would put state in the live userdata; leaving it implicit selects ~/.fcode/dev.
        assert.equal(yield* homeFor("~/.fcode"), undefined);
        assert.equal(yield* homeFor("/home/dev/.fcode/"), undefined);
      }),
    );

    it.effect("rejects a specific non-loopback --host for browser dev modes", () => {
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.succeed(mockProcess(0))),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput({
          ...devServerInput,
          mode: "dev",
          port: undefined,
          host: "192.168.1.10",
        }).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerHostNotProxiableError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.mode, "dev");
        assert.equal(error.host, "192.168.1.10");
        assert.include(error.message, "0.0.0.0");
        assert.include(error.message, "--share");
      });
    });

    // A shared origin means a remote browser, where unbundled dev's
    // per-module waterfall pays a tailnet round trip per import level. The
    // runner defaults bundled dev on for the spawned stack, but only
    // defaults: an explicit FCODE_BUNDLED_DEV (even "0") must pass through.
    describe("--share spawn wiring", () => {
      const shareSpawned = (input: {
        readonly ambientBundledDev?: string | undefined;
        readonly built?: boolean;
        readonly host?: string;
      }) =>
        Effect.gen(function* () {
          let captured: Record<string, string | undefined> | undefined;
          let vpArgs: ReadonlyArray<string> = [];
          const tailscaleCalls: Array<ReadonlyArray<string>> = [];
          const spawnerLayer = Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make((command) => {
              const spawned = command as unknown as {
                readonly command: string;
                readonly args: ReadonlyArray<string>;
                readonly options?: { readonly env?: Record<string, string | undefined> };
              };
              if (spawned.command === "vp") {
                captured = spawned.options?.env;
                vpArgs = spawned.args;
                return Effect.succeed(mockProcess(0));
              }
              tailscaleCalls.push(spawned.args);
              return Effect.succeed(
                ChildProcessSpawner.makeHandle({
                  pid: ChildProcessSpawner.ProcessId(2),
                  exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
                  isRunning: Effect.succeed(false),
                  kill: () => Effect.void,
                  unref: Effect.succeed(Effect.void),
                  stdin: Sink.drain,
                  stdout: spawned.args.includes("status")
                    ? Stream.make(
                        new TextEncoder().encode(
                          JSON.stringify({ Self: { DNSName: "host.example.ts.net." } }),
                        ),
                      )
                    : Stream.empty,
                  stderr: Stream.empty,
                  all: Stream.empty,
                  getInputFd: () => Sink.drain,
                  getOutputFd: () => Stream.empty,
                }),
              );
            }),
          );

          yield* runDevRunnerWithInput({
            ...devServerInput,
            mode: "dev",
            port: undefined,
            share: true,
            built: input.built ?? false,
            host: input.host,
          }).pipe(
            Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
            Effect.provideService(HostProcess.Platform, "linux"),
            Effect.provideService(
              HostProcess.Environment,
              input.ambientBundledDev === undefined
                ? {}
                : { FCODE_BUNDLED_DEV: input.ambientBundledDev },
            ),
          );

          return { env: captured, vpArgs, tailscaleCalls };
        });

      it.effect("keeps an explicit FCODE_BUNDLED_DEV=0 opt-out", () =>
        Effect.gen(function* () {
          const { env } = yield* shareSpawned({ ambientBundledDev: "0" });
          assert.equal(env?.FCODE_BUNDLED_DEV, "0");
        }),
      );

      it.effect("--built serves the backend on the web port's tailnet URL", () =>
        Effect.gen(function* () {
          const { env, vpArgs, tailscaleCalls } = yield* shareSpawned({ built: true });
          assert.include(vpArgs, "dev:built");
          assert.equal(env?.FCODE_BUILT_DEV, "1");
          assert.equal(env?.FCODE_BUNDLED_DEV, undefined);
          assert.equal(env?.VITE_DEV_SERVER_URL, `https://host.example.ts.net:${env?.PORT}/`);
          const serve = tailscaleCalls.find((args) => args.includes("--bg"));
          assert.deepEqual(serve?.slice(-2), [
            `--https=${env?.PORT}`,
            `http://127.0.0.1:${env?.FCODE_PORT}`,
          ]);
        }),
      );

      it.effect("--built --host ::1 targets the backend's IPv6 loopback", () =>
        Effect.gen(function* () {
          const { env, tailscaleCalls } = yield* shareSpawned({ built: true, host: "::1" });
          const serve = tailscaleCalls.find((args) => args.includes("--bg"));
          assert.equal(serve?.at(-1), `http://[::1]:${env?.FCODE_PORT}`);
        }),
      );

      // Node resolves localhost to ::1 first, so a 127.0.0.1 target can miss the backend.
      it.effect("--built --host localhost keeps the backend's localhost name", () =>
        Effect.gen(function* () {
          const { env, tailscaleCalls } = yield* shareSpawned({ built: true, host: "localhost" });
          const serve = tailscaleCalls.find((args) => args.includes("--bg"));
          assert.equal(serve?.at(-1), `http://localhost:${env?.FCODE_PORT}`);
        }),
      );

      it.effect("without --built keeps Vite behind the tailnet URL", () =>
        Effect.gen(function* () {
          const { env, vpArgs, tailscaleCalls } = yield* shareSpawned({});
          assert.include(vpArgs, "dev");
          assert.notInclude(vpArgs, "dev:built");
          assert.equal(env?.FCODE_BUNDLED_DEV, "1");
          const serve = tailscaleCalls.find((args) => args.includes("--bg"));
          assert.equal(serve?.at(-1), `http://localhost:${env?.PORT}`);
        }),
      );
    });

    it.effect.each([
      { mode: "dev", share: false },
      { mode: "dev:web", share: true },
      { mode: "dev:desktop", share: true },
    ] as const)("rejects --built for $mode with share=$share", ({ mode, share }) => {
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.succeed(mockProcess(0))),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput({
          ...devServerInput,
          mode,
          port: undefined,
          share,
          built: true,
        }).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.flip,
        );

        assert.equal(error._tag, "DevRunnerBuiltNeedsShareError");
      });
    });

    it.effect("reports non-zero exits without manufacturing a cause", () => {
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.succeed(mockProcess(17))),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput(devServerInput).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerProcessExitError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.mode, "dev:server");
        assert.equal(error.executable, "vp");
        assert.equal(error.argumentCount, 5);
        assert.equal(error.shell, false);
        assert.equal(error.exitCode, 17);
        assert.ok(!("cause" in error));
        assert.notProperty(error, "args");
        assert.notInclude(error.message, "secret-token-value");
      });
    });

    describe("fcode home precedence", () => {
      const makeWorktree = Effect.acquireRelease(
        Effect.sync(() => {
          const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "fcode-devrunner-"));
          NodeFS.writeFileSync(
            NodePath.join(root, ".git"),
            "gitdir: /elsewhere/.git/worktrees/x\n",
          );
          return root;
        }),
        (root) => Effect.sync(() => NodeFS.rmSync(root, { recursive: true, force: true })),
      );

      const spawnedHome = (input: {
        readonly fcodeHome: string | undefined;
        readonly cwd: string;
        readonly ambientHome: string | undefined;
      }) =>
        Effect.gen(function* () {
          let captured: Record<string, string | undefined> | undefined;
          const spawnerLayer = Layer.succeed(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make((command) => {
              captured = (
                command as {
                  readonly options?: { readonly env?: Record<string, string | undefined> };
                }
              ).options?.env;
              return Effect.succeed(mockProcess(0));
            }),
          );

          yield* runDevRunnerWithInput({ ...devServerInput, fcodeHome: input.fcodeHome }).pipe(
            Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
            Effect.provideService(HostProcess.Platform, "linux"),
            Effect.provideService(HostProcess.WorkingDirectory, input.cwd),
            // No ~/.fcode here, so these runs never seed from this machine's install.
            Effect.provideService(HostProcess.HomeDirectory, NodePath.join(input.cwd, "home")),
            Effect.provideService(
              HostProcess.Environment,
              input.ambientHome === undefined ? {} : { FCODE_HOME: input.ambientHome },
            ),
          );

          return captured?.FCODE_HOME;
        });

      it.effect("prefers an explicit --home-dir over the worktree default", () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const root = yield* makeWorktree;
          const home = yield* spawnedHome({
            fcodeHome: "/tmp/explicit-home",
            cwd: root,
            ambientHome: "/home/user/.fcode",
          });
          assert.equal(home, path.resolve("/tmp/explicit-home"));
        }).pipe(Effect.scoped),
      );

      it.effect("treats a blank --home-dir as unset rather than as a selection", () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const root = yield* makeWorktree;
          const home = yield* spawnedHome({
            fcodeHome: "   ",
            cwd: root,
            ambientHome: "/home/user/.fcode",
          });
          assert.equal(home, path.join(path.resolve(root), ".fcode"));
        }).pipe(Effect.scoped),
      );

      it.effect("prefers the worktree .fcode over an ambient FCODE_HOME", () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const root = yield* makeWorktree;
          const home = yield* spawnedHome({
            fcodeHome: undefined,
            cwd: root,
            ambientHome: "/home/user/.fcode",
          });
          assert.equal(home, path.join(path.resolve(root), ".fcode"));
        }).pipe(Effect.scoped),
      );

      it.effect("seeds a worktree database from ~/.fcode only when it has none", () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const root = yield* makeWorktree;
          const home = path.join(root, "home");
          NodeFS.mkdirSync(path.join(home, ".fcode", "userdata"), { recursive: true });
          NodeFS.writeFileSync(path.join(home, ".fcode", "userdata", "statev2.sqlite"), "");

          const spawnedArgs = (seed: boolean | undefined) =>
            Effect.gen(function* () {
              const spawned: Array<ReadonlyArray<string>> = [];
              const spawnerLayer = Layer.succeed(
                ChildProcessSpawner.ChildProcessSpawner,
                ChildProcessSpawner.make((command) => {
                  spawned.push(
                    (command as unknown as { readonly args: ReadonlyArray<string> }).args,
                  );
                  return Effect.succeed(mockProcess(0));
                }),
              );
              yield* runDevRunnerWithInput({ ...devServerInput, fcodeHome: undefined, seed }).pipe(
                Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
                Effect.provideService(HostProcess.Platform, "linux"),
                Effect.provideService(HostProcess.WorkingDirectory, root),
                Effect.provideService(HostProcess.HomeDirectory, home),
                Effect.provideService(HostProcess.Environment, {}),
              );
              return spawned.filter((args) =>
                args.some((arg) => arg.endsWith("migrate-dev-db.ts")),
              );
            });

          assert.deepStrictEqual(yield* spawnedArgs(false), []);
          const [seedArgs] = yield* spawnedArgs(undefined);
          assert.includeMembers([...(seedArgs ?? [])], ["--base-dir", path.join(root, ".fcode")]);

          // Either database means the worktree already has data.
          for (const name of ["state.sqlite", "statev2.sqlite"]) {
            const file = path.join(root, ".fcode", "userdata", name);
            NodeFS.mkdirSync(path.dirname(file), { recursive: true });
            NodeFS.writeFileSync(file, "");
            assert.deepStrictEqual(yield* spawnedArgs(undefined), []);
            NodeFS.rmSync(file);
          }
        }).pipe(Effect.scoped),
      );

      it.effect.each([
        { sourceBytes: 500 * 1024 * 1024 - 1, shouldSeed: true },
        { sourceBytes: 500 * 1024 * 1024, shouldSeed: true },
        { sourceBytes: 500 * 1024 * 1024 + 1, shouldSeed: false },
      ])(
        "checks source size before seeding an empty worktree: $sourceBytes bytes",
        ({ sourceBytes, shouldSeed }) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const root = yield* makeWorktree;
            const home = path.join(root, "home");
            const source = path.join(home, ".fcode", "userdata", "statev2.sqlite");
            NodeFS.mkdirSync(path.dirname(source), { recursive: true });
            NodeFS.writeFileSync(source, "");
            const spawned: Array<ReadonlyArray<string>> = [];
            const warnings: Array<string> = [];
            const spawnerLayer = Layer.succeed(
              ChildProcessSpawner.ChildProcessSpawner,
              ChildProcessSpawner.make((command) => {
                spawned.push((command as unknown as { readonly args: ReadonlyArray<string> }).args);
                return Effect.succeed(mockProcess(0));
              }),
            );

            yield* runDevRunnerWithInput({ ...devServerInput, fcodeHome: undefined }).pipe(
              Effect.provide([
                emptyConfigLayer,
                netServiceLayer,
                spawnerLayer,
                Logger.layer([
                  Logger.make((options) => {
                    if (options.logLevel === "Warn") warnings.push(String(options.message));
                  }),
                ]),
              ]),
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                stat: (file) =>
                  fs
                    .stat(file)
                    .pipe(
                      Effect.map((info) =>
                        file === source ? { ...info, size: ByteSize.bytes(sourceBytes) } : info,
                      ),
                    ),
              }),
              Effect.provideService(HostProcess.Platform, "linux"),
              Effect.provideService(HostProcess.WorkingDirectory, root),
              Effect.provideService(HostProcess.HomeDirectory, home),
              Effect.provideService(HostProcess.Environment, {}),
            );

            assert.equal(
              spawned.some((args) => args.some((arg) => arg.endsWith("migrate-dev-db.ts"))),
              shouldSeed,
            );
            assert.deepStrictEqual(spawned.at(-1), [
              "run",
              "--filter=fcode",
              "dev",
              ...devServerInput.runArgs,
            ]);
            if (shouldSeed) {
              assert.deepStrictEqual(warnings, []);
            } else {
              assert.lengthOf(warnings, 1);
              assert.include(warnings[0]!, source);
              assert.include(warnings[0]!, "skipping automatic database seeding");
              assert.include(warnings[0]!, "vp run migrate-dev-db");
            }
          }).pipe(Effect.scoped),
      );

      it.effect("falls back to an ambient FCODE_HOME outside a worktree", () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const home = yield* spawnedHome({
            fcodeHome: undefined,
            cwd: NodeOS.tmpdir(),
            ambientHome: "/home/user/.fcode",
          });
          assert.equal(home, path.resolve("/home/user/.fcode"));
        }),
      );
    });
  });
});
