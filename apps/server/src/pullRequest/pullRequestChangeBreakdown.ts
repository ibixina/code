import type { PullRequestChangeBreakdown } from "@fcode/contracts";
import { summarizeChangedFiles } from "@fcode/shared/changedFileKind";
import type { ProviderFileStats } from "@fcode/source-control-core/server/PullRequestProvider";

export function toChangeBreakdown(stats: ProviderFileStats): PullRequestChangeBreakdown {
  if (stats.truncated) return null;
  return summarizeChangedFiles(stats.files);
}
