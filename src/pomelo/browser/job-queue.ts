interface JobRow {
  id: string;
  profileId: string;
  state: "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
  resourceLock: string | null;
}

/** Pick one job per free profile from a queue in oldest-first order. */
export function pickNextJobs(jobs: readonly Readonly<JobRow>[]): {
  start: string[];
  held: { id: string; heldBy: string }[];
} {
  const holders = new Map<string, string>();

  // Explicit locks take precedence over holders inferred from job state.
  for (const { id, state, resourceLock } of jobs) {
    if (resourceLock === null || state === "done" || state === "failed" || state === "cancelled") continue;
    if (!holders.has(resourceLock)) holders.set(resourceLock, id);
  }

  for (const { id, profileId, state } of jobs) {
    if ((state === "running" || state === "waiting") && !holders.has(profileId)) {
      holders.set(profileId, id);
    }
  }

  const start: string[] = [];
  const held: { id: string; heldBy: string }[] = [];
  for (const { id, profileId, state } of jobs) {
    if (state !== "queued") continue;
    const heldBy = holders.get(profileId);
    if (heldBy === undefined) {
      start.push(id);
      holders.set(profileId, id);
    } else {
      held.push({ id, heldBy });
    }
  }

  return { start, held };
}
