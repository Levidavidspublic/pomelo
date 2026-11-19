interface BrowserJob {
  profileId: string;
  state: string;
}

interface BrowserProfile {
  id: string;
  location: "local" | "cloud";
}

interface BrowserWorker {
  id: string;
  where: "desktop" | "vps";
  online: boolean;
  cdpReachable?: boolean;
}

type RunnerPick =
  | { run: string }
  | { hold: "profile-mismatch" | "not-queued" | "vps-unreachable" | "pc-offline" };

/** Selects the worker before any browser driver is called. */
export function pickRunner(job: BrowserJob, profile: BrowserProfile, workers: readonly BrowserWorker[]): RunnerPick {
  if (typeof profile?.id !== "string" || job?.profileId !== profile.id) {
    return { hold: "profile-mismatch" };
  }
  const { location } = profile;
  if (location !== "local" && location !== "cloud") {
    return { hold: "profile-mismatch" };
  }
  if (job.state !== "queued") return { hold: "not-queued" };

  const cloud = location === "cloud";
  const where = cloud ? "vps" : "desktop";
  const unavailable = { hold: cloud ? "vps-unreachable" : "pc-offline" } as const;
  if (!Array.isArray(workers)) return unavailable;

  let workerId: string | undefined;
  for (const worker of workers) {
    if (worker?.online !== true || worker.where !== where || typeof worker.id !== "string") continue;
    if (cloud && worker.cdpReachable !== true) continue;
    if (workerId === undefined || worker.id < workerId) workerId = worker.id;
  }
  return workerId === undefined ? unavailable : { run: workerId };
}
