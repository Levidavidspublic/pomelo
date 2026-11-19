export interface JobBudget {
  maxMs: number;
  maxSteps: number;
  maxSameStepRepeats: number;
}

// Compare masked metadata from the runner before the step log formats it as text.
export interface JobBudgetStep {
  kind: string;
  target?: string;
}

export interface JobBudgetInput {
  startedAt: number;
  stepCount: number;
  /** Recent masked steps, oldest first. */
  steps: readonly JobBudgetStep[];
}

export interface JobBudgetResult {
  verdict: "ok" | "warn" | "hold";
  reason: string;
  used: { ms: number; steps: number; sameStepRepeats: number };
}

export const DEFAULT_JOB_BUDGET: Readonly<JobBudget> = Object.freeze({
  maxMs: 5 * 60_000,
  maxSteps: 100,
  maxSameStepRepeats: 4,
});

function limitOrDefault(limit: number | undefined, fallback: number): number {
  return limit !== undefined && Number.isFinite(limit) && limit > 0 ? limit : fallback;
}

function countRepeats(steps: readonly JobBudgetStep[]): number {
  const last = steps.at(-1);
  if (!last) return 0;

  let repeats = 0;
  for (let index = steps.length - 2; index >= 0; index--) {
    const step = steps[index];
    if (step.kind !== last.kind || step.target !== last.target) break;
    repeats++;
  }
  return repeats;
}

/** Check a running job using timestamps in milliseconds and consecutive repeats after the first matching step. */
export function jobBudgetCheck(job: JobBudgetInput, budget: Partial<JobBudget> | undefined, now: number): JobBudgetResult {
  const used = {
    ms: Math.max(0, now - job.startedAt),
    steps: job.stepCount,
    sameStepRepeats: countRepeats(job.steps),
  };
  const limits = [
    { value: used.ms, limit: limitOrDefault(budget?.maxMs, DEFAULT_JOB_BUDGET.maxMs), unit: "ms" },
    { value: used.steps, limit: limitOrDefault(budget?.maxSteps, DEFAULT_JOB_BUDGET.maxSteps), unit: "steps" },
    { value: used.sameStepRepeats, limit: limitOrDefault(budget?.maxSameStepRepeats, DEFAULT_JOB_BUDGET.maxSameStepRepeats), unit: "consecutive repeats" },
  ];

  const exceeded = limits.find(({ value, limit }) => value > limit);
  if (exceeded) {
    const { value, limit, unit } = exceeded;
    return { verdict: "hold", reason: `The job used ${value} ${unit} and exceeded its limit of ${limit}.`, used };
  }

  const near = limits.find(({ value, limit }) => value >= limit * 0.8);
  if (near) {
    const { value, limit, unit } = near;
    return { verdict: "warn", reason: `The job has used ${value} of its ${limit} ${unit}.`, used };
  }

  return { verdict: "ok", reason: `The job is within budget after ${used.ms} ms.`, used };
}
