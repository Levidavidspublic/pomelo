type Runner = "pc" | "vps";
type InterruptedStep = "fill" | "import" | "download";

export type SweepJob = {
  id: string;
  profileId: string;
  /** Persisted state may come from a version that knows states this runner does not. */
  state: string;
  runner: Runner;
  thisRunner: Runner;
  lastStepKind?: "read" | "click" | "navigate" | InterruptedStep | null;
  lastStepAt?: number | null;
};

export type SweepAction =
  | { id: string; action: "keep"; reason?: "unknown-state" }
  | { id: string; action: "hold"; state: "waiting"; reason: "restarted"; needsAmit: false }
  | { id: string; action: "hold-for-amit"; state: "waiting"; reason: `restarted-mid-${InterruptedStep}`; needsAmit: true };

/** Restart decisions use runner ownership and step kind regardless of elapsed time. */
export function sweepOnRestart(jobs: SweepJob[], _now: number): { actions: SweepAction[]; locksToRelease: string[] } {
  const runningByProfile = new Map<string, number>();
  const heldProfiles = new Set<string>();

  const actions = jobs.map<SweepAction>(({ id, profileId, state, runner, thisRunner, lastStepKind }) => {
    switch (state) {
      case "queued":
      case "waiting":
      case "done":
      case "failed":
      case "cancelled":
        return { id, action: "keep" };
      case "running":
        break;
      default:
        return { id, action: "keep", reason: "unknown-state" };
    }

    runningByProfile.set(profileId, (runningByProfile.get(profileId) ?? 0) + 1);
    if (runner !== thisRunner) return { id, action: "keep" };

    heldProfiles.add(profileId);
    if (lastStepKind === "fill" || lastStepKind === "import" || lastStepKind === "download") {
      return { id, action: "hold-for-amit", state: "waiting", reason: `restarted-mid-${lastStepKind}`, needsAmit: true };
    }
    return { id, action: "hold", state: "waiting", reason: "restarted", needsAmit: false };
  });

  const locksToRelease = [...heldProfiles].filter((profileId) => runningByProfile.get(profileId) === 1);
  return { actions, locksToRelease };
}
