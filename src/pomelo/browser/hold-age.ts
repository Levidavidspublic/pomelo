import type { JobState } from "./job-state.js";

interface HoldAgeLimits {
  remindAfterMs?: number;
  parkAfterMs?: number;
}

interface HoldAgeInput {
  job: Readonly<{
    state: JobState;
    heldAt?: number | null;
    holdReason: string;
    remindedAt?: number | null;
    midFill?: boolean;
    midImport?: boolean;
  }>;
  now: number;
  limits?: Readonly<HoldAgeLimits>;
}

type HoldAgeResult =
  | { action: "wait" | "remind" | "keep"; reason: string; mustReread: false }
  | { action: "park"; reason: string; mustReread: true };

const DEFAULT_LIMITS = Object.freeze({
  remindAfterMs: 30 * 60_000,
  parkAfterMs: 6 * 60 * 60_000,
});

function positiveLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function wait(reason: string): HoldAgeResult {
  return { action: "wait", reason, mustReread: false };
}

/** Decide from a job snapshot and supplied millisecond timestamps. */
export function holdAge({ job, now, limits }: HoldAgeInput): HoldAgeResult {
  if (job.state !== "waiting") return wait("Only waiting jobs are checked for hold age.");
  if (!Number.isFinite(now) || now < 0) return wait("The clock reading is invalid.");

  const { heldAt, remindedAt, midFill, midImport } = job;
  if (heldAt == null) return wait("The hold time is missing.");
  if (!Number.isFinite(heldAt) || heldAt < 0) return wait("The hold time is invalid.");
  if (heldAt > now) return wait("The hold time is in the future.");

  if (midFill || midImport) {
    return { action: "keep", reason: "The job needs the profile to finish a fill or import.", mustReread: false };
  }

  const age = now - heldAt;
  const parkAfterMs = positiveLimit(limits?.parkAfterMs, DEFAULT_LIMITS.parkAfterMs);
  if (age >= parkAfterMs) {
    return {
      action: "park",
      reason: "The job can free the profile and keep waiting. Read the page again before continuing.",
      mustReread: true,
    };
  }

  if (remindedAt != null) return wait("Amit has already been reminded.");
  const remindAfterMs = positiveLimit(limits?.remindAfterMs, DEFAULT_LIMITS.remindAfterMs);
  if (age >= remindAfterMs) {
    return { action: "remind", reason: "A reminder for Amit is due.", mustReread: false };
  }

  return wait("The job has not been waiting long enough for a reminder.");
}
