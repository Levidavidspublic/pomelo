import type { JobState } from "./job-state.js";
import type { BrowserSkillStepKind } from "./skill-preflight.js";
import type { RawStep } from "./step-log.js";

const holdLabels = {
  captcha: "a CAPTCHA",
  "one-time-code": "a one-time code",
  "sign-in": "a sign-in box",
  "certificate-warning": "a certificate warning",
  "risky-click": "a risky click",
};

const unfinishedReasons: Record<Exclude<JobState, "done">, string> = {
  queued: "The browser job is still queued.",
  running: "The browser job is still running.",
  waiting: "The browser job is still waiting.",
  failed: "The browser job failed.",
  cancelled: "The browser job was cancelled.",
};

export interface SkillSaveStep {
  index: number;
  kind: RawStep["kind"] | BrowserSkillStepKind;
  heldFor?: keyof typeof holdLabels;
  maskOff?: boolean;
}

export interface SkillSaveInput {
  jobState: JobState;
  askedBy: "amit" | "agent";
  steps: readonly SkillSaveStep[];
}

export interface SkillSaveResult {
  decision: "save" | "ask" | "refuse";
  reason: string;
  steps: number[];
}

/** Checks whether a finished browser job may be saved using only step metadata. */
export function skillSaveDecision({ jobState, askedBy, steps }: SkillSaveInput): SkillSaveResult {
  if (jobState !== "done") {
    const reason = typeof jobState === "string" && Object.hasOwn(unfinishedReasons, jobState)
      ? unfinishedReasons[jobState]
      : "The browser job has an unknown state.";
    return { decision: "refuse", reason, steps: [] };
  }
  if (steps.length === 0) {
    return { decision: "refuse", reason: "The browser job has no steps.", steps: [] };
  }

  const unmasked = steps.filter(({ maskOff }) => maskOff === true).map(({ index }) => index);
  if (unmasked.length > 0) {
    return {
      decision: "refuse",
      reason: unmasked.map((index) => `Step ${index} ran with masking off.`).join(" "),
      steps: unmasked,
    };
  }

  const heldSteps: number[] = [];
  const holdReasons: string[] = [];
  for (const { index, heldFor } of steps) {
    if (heldFor === undefined) continue;
    const label = typeof heldFor === "string" && Object.hasOwn(holdLabels, heldFor)
      ? holdLabels[heldFor]
      : "an unknown reason";
    heldSteps.push(index);
    holdReasons.push(`Step ${index} was held for ${label}.`);
  }
  if (heldSteps.length > 0) {
    return {
      decision: "ask",
      reason: `Amit must confirm the save and handle the held steps on every run. ${holdReasons.join(" ")}`,
      steps: heldSteps,
    };
  }

  if (askedBy !== "amit") {
    return { decision: "ask", reason: "Amit must confirm the save.", steps: [] };
  }
  return { decision: "save", reason: "Amit asked to save this finished browser job.", steps: [] };
}
