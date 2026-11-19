export type SweepGrant = Readonly<{
  id: string;
  refId: string;
  origin: string;
  frame: string;
  jobId: string;
  expiresAt: number;
  revoked: boolean;
}>;

export type SweepJob = Readonly<{
  id: string;
  state: "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
}>;

type Revocation = {
  grantId: string;
  reason: "job-ended" | "job-missing" | "expired";
};

export function grantSweep(
  grants: readonly SweepGrant[],
  jobs: readonly SweepJob[],
  now: number,
): Revocation[] {
  const statesByJobId = new Map(jobs.map(({ id, state }) => [id, state]));
  const revocations: Revocation[] = [];

  for (const { id, jobId, expiresAt, revoked } of grants) {
    if (revoked) continue;

    const state = statesByJobId.get(jobId);
    if (state === undefined) {
      revocations.push({ grantId: id, reason: "job-missing" });
    } else if (state === "done" || state === "failed" || state === "cancelled") {
      revocations.push({ grantId: id, reason: "job-ended" });
    } else if (now >= expiresAt) {
      revocations.push({ grantId: id, reason: "expired" });
    }
  }

  return revocations.sort((a, b) => {
    if (a.grantId < b.grantId) return -1;
    return a.grantId > b.grantId ? 1 : 0;
  });
}
