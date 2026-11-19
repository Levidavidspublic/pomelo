export interface PanelJob {
  id: string;
  threadId: string;
  laneId: string;
  profileId: string;
  state: string;
  steps: readonly string[];
  updatedAt?: number;
}

export interface PanelProfile {
  id: string;
  name: string;
  location: "local" | "cloud";
  cdpUrlName?: string;
}

export interface BrowserPanelRow {
  id: string;
  label: string;
  state: string;
  profileName: string;
  vps: boolean;
  lastStep: string;
}

const stateLabels = new Map([
  ["queued", "Queued"],
  ["running", "Running"],
  ["waiting", "Waiting"],
  ["done", "Done"],
  ["failed", "Failed"],
  ["cancelled", "Cancelled"],
]);

export function browserPanel(input: {
  threadId: string;
  jobs: readonly PanelJob[];
  profiles: readonly PanelProfile[];
  maskOff?: boolean;
}): { rows: BrowserPanelRow[]; activeJobId: string | null; masked: boolean; vps: boolean } {
  const profilesById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const jobs = input.jobs.filter((job) => job.threadId === input.threadId);
  jobs.sort((a, b) => {
    // Stored jobs may predate activity timestamps.
    const aTime = a.updatedAt ?? -Infinity;
    const bTime = b.updatedAt ?? -Infinity;
    if (aTime !== bTime) return bTime - aTime;
    if (a.id < b.id) return -1;
    return a.id > b.id ? 1 : 0;
  });

  const rows = jobs.map((job): BrowserPanelRow => {
    const profile = profilesById.get(job.profileId);
    return {
      id: job.id,
      label: stateLabels.get(job.state) ?? "Waiting",
      state: job.state,
      profileName: profile?.name ?? "Unknown profile",
      vps: profile?.location === "cloud",
      lastStep: job.steps.at(-1) ?? "",
    };
  });
  const active = rows.find((row) => row.state === "running" || row.state === "waiting");

  return {
    rows,
    activeJobId: active?.id ?? null,
    masked: input.maskOff !== true,
    vps: active?.vps ?? false,
  };
}
