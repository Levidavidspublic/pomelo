export interface ImportStartProfile {
  id: string;
  home: "pc" | "vps";
  openHere: boolean;
}

export type ImportStartLockHolder = { kind: "job" | "import"; id: string };

export interface ImportStartRun {
  targetProfileId: string;
  endedAt?: number;
}

export interface ImportStartInput {
  profile: ImportStartProfile;
  lockHolder: ImportStartLockHolder | null;
  importRuns: readonly ImportStartRun[];
  /** Both site lists contain hostnames only. */
  pickedSites: readonly string[];
  existingSites: readonly string[];
  confirmReplace: boolean;
}

export interface ImportStartResult {
  verdict: "start" | "wait" | "hold" | "refuse";
  reason: string;
  overlapSites: string[];
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

export function importStartDecision({
  profile, lockHolder, importRuns, pickedSites, existingSites, confirmReplace,
}: ImportStartInput): ImportStartResult {
  if (lockHolder?.kind === "job") {
    return { verdict: "wait", reason: "A job is using this profile.", overlapSites: [] };
  }
  if (lockHolder?.kind === "import" || importRuns.some((run) => run.targetProfileId === profile.id && run.endedAt === undefined)) {
    return { verdict: "wait", reason: "Another import is using this profile.", overlapSites: [] };
  }
  if (!profile.openHere) {
    return { verdict: "refuse", reason: "This profile cannot open on this machine.", overlapSites: [] };
  }
  if (pickedSites.length === 0) {
    return { verdict: "refuse", reason: "Select at least one site to import.", overlapSites: [] };
  }

  const existingHosts = new Set(existingSites.map(normalizeHost));
  const pickedHosts = new Set(pickedSites.map(normalizeHost));
  const overlapSites = [...pickedHosts].filter((host) => existingHosts.has(host)).sort();
  if (overlapSites.length > 0 && confirmReplace !== true) {
    return { verdict: "hold", reason: "Confirm replacement of existing logins for the overlapping sites.", overlapSites };
  }
  return { verdict: "start", reason: "This profile is ready for the import.", overlapSites };
}
