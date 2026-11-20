export interface LoopStep {
  kind: string;
  target?: string | number;
  pageUrl: string;
  fingerprint: string;
}

export interface LoopLimits {
  maxSameStepRepeats: number;
  maxRoundTrips: number;
}

export interface LoopResult {
  verdict: "go" | "warn" | "hold";
  reason: string;
  action?: string;
  repeats: number;
}

export const DEFAULT_LOOP_LIMITS: Readonly<LoopLimits> = Object.freeze({
  maxSameStepRepeats: 3,
  maxRoundTrips: 4,
});

const actionKinds = new Set([
  "open", "navigate", "back", "forward", "reload", "click", "type", "fill", "press", "select",
  "read", "import", "upload", "download", "other",
]);

function limitOrDefault(limit: number | undefined, fallback: number): number {
  return limit !== undefined && Number.isSafeInteger(limit) && limit >= 2 ? limit : fallback;
}

function pageKey(address: string): string | undefined {
  try {
    const { origin, pathname } = new URL(address);
    return origin === "null" ? undefined : origin + pathname;
  } catch {
    return undefined;
  }
}

function countRoundTrips(pages: readonly (string | undefined)[]): number {
  const latest = pages.at(-1);
  const previous = pages.at(-2);
  if (!latest || !previous || latest === previous) return 0;

  let transitions = 1;
  for (let index = pages.length - 3; index >= 0; index--) {
    if (pages[index] !== pages[index + 2]) break;
    transitions++;
  }
  return Math.floor(transitions / 2);
}

/** Check the current streak in recent masked steps, ordered oldest first. */
export function stepLoopCheck(steps: readonly LoopStep[], limits?: Partial<LoopLimits>): LoopResult {
  const active = steps.filter(({ kind }) => kind !== "scroll" && kind !== "wait");
  const last = active.at(-1);
  const pages = active.map(({ pageUrl }) => pageKey(pageUrl));
  const latestPage = pages.at(-1);
  if (!last || !latestPage) return { verdict: "go", reason: "No step loop detected.", repeats: 0 };

  let sameSteps = 0;
  for (let index = active.length - 1; last.fingerprint && index >= 0; index--) {
    const { kind, target, fingerprint } = active[index];
    if (kind !== last.kind || target !== last.target || fingerprint !== last.fingerprint || pages[index] !== latestPage) break;
    sameSteps++;
  }

  const roundTrips = countRoundTrips(pages);
  const action = actionKinds.has(last.kind) ? last.kind : "other";
  const sameStepLimit = limitOrDefault(limits?.maxSameStepRepeats, DEFAULT_LOOP_LIMITS.maxSameStepRepeats);
  const roundTripLimit = limitOrDefault(limits?.maxRoundTrips, DEFAULT_LOOP_LIMITS.maxRoundTrips);
  const loop = roundTrips > 0
    ? { repeats: roundTrips, limit: roundTripLimit, reason: `The job made ${roundTrips} round trips between the same two pages, ending with ${action}.` }
    : { repeats: sameSteps, limit: sameStepLimit, reason: `The job ran the ${action} action ${sameSteps} times in a row without a page change.` };

  if (loop.repeats >= loop.limit) {
    return { verdict: "hold", reason: `${loop.reason} Hold for Amit to review.`, action, repeats: loop.repeats };
  }
  if (loop.repeats === loop.limit - 1) {
    return { verdict: "warn", reason: loop.reason, action, repeats: loop.repeats };
  }
  return { verdict: "go", reason: "No step loop detected.", repeats: roundTrips || (sameSteps > 1 ? sameSteps : 0) };
}
