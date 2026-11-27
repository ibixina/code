import { type CliReleaseChannel, cliReleaseChannelOf } from "./cliRelease.ts";

export type ReleaseChannel = "dev" | CliReleaseChannel;

// Desktop PR preview builds are stamped `X.Y.Z-pr.<number>.<run>`; the CLI updater must not see them as preview.
export const releaseChannelOf = (version: string): ReleaseChannel =>
  /-pr\.\d+\.\d+$/.test(version) ? "preview" : cliReleaseChannelOf(version);
