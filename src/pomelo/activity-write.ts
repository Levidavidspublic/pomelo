const DEFAULT_MIN_GAP_MS = 2000;

const immediateKinds: ReadonlySet<string> = new Set([
  "message",
  "card",
  "approval",
  "subagent_result",
  "thread_opened",
  "job_held",
]);

/** Decide whether the caller should persist a newer activity timestamp. */
export function decideActivityWrite(
  { lastWrittenAt, eventAt, kind }: { lastWrittenAt: number | null; eventAt: number; kind: string },
  { minGapMs = DEFAULT_MIN_GAP_MS }: { minGapMs?: number } = {},
): { action: "write" | "skip"; reason: string } {
  if (!Number.isFinite(eventAt)) {
    return { action: "skip", reason: "The event time must be a finite number." };
  }
  if (lastWrittenAt === null) {
    return { action: "write", reason: "This is the thread's first activity." };
  }
  if (!Number.isFinite(lastWrittenAt)) {
    return { action: "skip", reason: "The last written time must be a finite number." };
  }
  if (eventAt <= lastWrittenAt) {
    return { action: "skip", reason: "The event time is older than or equal to the last written time." };
  }
  if (immediateKinds.has(kind)) {
    return { action: "write", reason: "This event changes what the user sees immediately." };
  }

  const gap = Number.isFinite(minGapMs) && minGapMs >= 0 ? minGapMs : DEFAULT_MIN_GAP_MS;
  if (eventAt - lastWrittenAt < gap) {
    return { action: "skip", reason: "The minimum gap since the last write has not elapsed." };
  }
  return { action: "write", reason: "The minimum gap since the last write has elapsed." };
}
