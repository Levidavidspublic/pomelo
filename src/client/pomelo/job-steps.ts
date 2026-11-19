export type JobStepState = "done" | "running" | "waiting" | "failed" | "skipped";

export interface MaskedJobStep {
  id: string;
  kind: string;
  state?: string;
  at?: number;
  target?: string;
  referenceLabel?: string;
  charCount?: number;
  masked?: boolean;
  needsAmit?: boolean;
}

export interface JobStepRow {
  id: string;
  label: string;
  state: JobStepState;
  timeLabel: string;
  masked: boolean;
  needsAmit: boolean;
}

function addressLabel(target: string | undefined): string {
  if (typeof target !== "string") return "address";
  try {
    const url = new URL(target);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return `${url.host}${url.pathname}`;
    }
  } catch {
    // A malformed address has no safe host and path to display.
  }
  return "address";
}

function stepLabel(step: MaskedJobStep, done: boolean): string {
  switch (step.kind) {
    case "open": return `${done ? "Opened" : "Open"} ${addressLabel(step.target)}`;
    case "click": return done ? "Clicked" : "Click";
    case "type": {
      const { charCount } = step;
      const label = done ? "Typed text" : "Type text";
      if (typeof charCount !== "number" || !Number.isSafeInteger(charCount) || charCount < 0) return label;
      return `${label} (${charCount} ${charCount === 1 ? "character" : "characters"})`;
    }
    case "fill": {
      const action = done ? "Filled" : "Fill";
      const field = step.target === "password" ? " password" : "";
      const label = typeof step.referenceLabel === "string" ? step.referenceLabel.trim() : "";
      if (label && !/op:\/\//i.test(label)) return `${action}${field} from ${label}`;
      return `${action}${field || " field"}`;
    }
    case "read": return "Read page";
    case "screenshot": return done ? "Took screenshot" : "Take screenshot";
    case "download": return done ? "Downloaded" : "Download";
    case "wait": return done ? "Waited" : "Wait";
    case "held": return "Held";
    default: return "Step";
  }
}

function stepState(state: string | undefined, held: boolean): JobStepState {
  if (state === "failed") return "failed";
  if (held) return "waiting";
  if (state === "done" || state === "running" || state === "skipped") return state;
  return "waiting";
}

function relativeTime(at: number | undefined, now: number): string {
  if (typeof at !== "number" || !Number.isFinite(at) || !Number.isFinite(now)) return "Time unknown";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export function jobStepRows(steps: readonly (MaskedJobStep | string)[], { now }: { now: number }): JobStepRow[] {
  return steps.map((stored, index) => {
    // Older log lines only have a kind followed by undelimited target, value and note text.
    const step = typeof stored === "string"
      ? { id: `step-${index}`, kind: stored.split(/\s/, 1)[0] }
      : stored;
    const held = step.kind === "held" || step.state === "held";
    const state = stepState(step.state, held);
    return {
      id: step.id,
      label: stepLabel(step, state === "done"),
      state,
      timeLabel: relativeTime(step.at, now),
      masked: step.kind === "fill" || step.masked !== false,
      needsAmit: held || step.needsAmit === true,
    };
  });
}
