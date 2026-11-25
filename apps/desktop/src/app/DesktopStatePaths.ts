import * as Option from "effect/Option";

export type JoinPath = (first: string, ...segments: string[]) => string;

function normalizeConfiguredBaseDir(fcodeHome: Option.Option<string>): Option.Option<string> {
  if (Option.isNone(fcodeHome)) {
    return Option.none();
  }
  const trimmed = fcodeHome.value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
}

export function resolveDesktopBaseDir(input: {
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  readonly fcodeHome: Option.Option<string>;
}): string {
  return Option.getOrElse(normalizeConfiguredBaseDir(input.fcodeHome), () =>
    input.joinPath(input.homeDirectory, ".fcode"),
  );
}

export function resolveDesktopStateDir(input: {
  readonly baseDir: string;
  readonly isDevelopment: boolean;
  readonly joinPath: JoinPath;
  readonly fcodeHome: Option.Option<string>;
}): string {
  const useDevSubdir =
    input.isDevelopment && Option.isNone(normalizeConfiguredBaseDir(input.fcodeHome));
  return input.joinPath(input.baseDir, useDevSubdir ? "dev" : "userdata");
}
