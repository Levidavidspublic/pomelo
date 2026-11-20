export const WAIT_REASONS = [
  { reason: "approval", label: "Approval needed" },
  { reason: "vault-locked", label: "Unlock 1Password" },
  { reason: "captcha", label: "Complete the CAPTCHA" },
  { reason: "vps-unreachable", label: "VPS not reachable" },
  { reason: "budget", label: "Review the job budget" },
  { reason: "other", label: "Needs you" },
] as const;

type WaitReason = (typeof WAIT_REASONS)[number]["reason"];

interface WaitingJob {
  id: string;
  threadId: string;
  vps: boolean;
}

interface WaitingGroup {
  reason: WaitReason;
  label: string;
  count: number;
  threadIds: string[];
  jobs: WaitingJob[];
}

interface WaitingSummary {
  total: number;
  byThread: Record<string, number | undefined>;
  groups: WaitingGroup[];
}

function waitReason(value: unknown): WaitReason {
  // The hold cards spell these reasons differently from the summary.
  if (value === "vault_locked") return "vault-locked";
  if (value === "cloud_unreachable") return "vps-unreachable";
  return WAIT_REASONS.find(({ reason }) => reason === value)?.reason ?? "other";
}

export function waitingJobs(jobs: unknown): WaitingSummary {
  const rows: readonly unknown[] = Array.isArray(jobs) ? jobs : [];
  const byThread = new Map<string, number>();
  const byReason = new Map<WaitReason, { job: WaitingJob; sortTime: number }[]>();
  let total = 0;

  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    const { state, id, threadId, waitReason: reason, waitingSince, location } = row as Record<string, unknown>;
    if (state !== "waiting" || typeof id !== "string" || !id || typeof threadId !== "string" || !threadId) continue;

    total += 1;
    byThread.set(threadId, (byThread.get(threadId) ?? 0) + 1);

    const groupReason = waitReason(reason);
    const entries = byReason.get(groupReason) ?? [];
    entries.push({
      job: { id, threadId, vps: location === "cloud" },
      sortTime: typeof waitingSince === "number" && Number.isFinite(waitingSince) ? waitingSince : Infinity,
    });
    byReason.set(groupReason, entries);
  }

  const groups: WaitingGroup[] = [];
  for (const { reason, label } of WAIT_REASONS) {
    const entries = byReason.get(reason);
    if (!entries) continue;

    entries.sort((a, b) => a.sortTime - b.sortTime);
    const groupJobs = entries.map(({ job }) => job);
    groups.push({
      reason,
      label,
      count: groupJobs.length,
      threadIds: [...new Set(groupJobs.map(({ threadId }) => threadId))],
      jobs: groupJobs,
    });
  }

  return { total, byThread: Object.fromEntries(byThread), groups };
}
