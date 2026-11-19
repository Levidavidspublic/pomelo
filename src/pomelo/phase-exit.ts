type Flow = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8";
type CanaryPlace = "modelInput" | "logs" | "bus" | "storage";

export interface PhaseExitResults {
  readonly npmTestPassed?: boolean;
  readonly smokeOpensApp?: boolean;
  readonly failingPrBlocked?: boolean;
  readonly pauseFileStopsMerge?: boolean;
  readonly flows?: Readonly<Partial<Record<Flow, boolean>>>;
  readonly agentToolCallsMocked?: boolean;
  readonly canaryHits?: Readonly<Partial<Record<CanaryPlace, number>>>;
  readonly jobFinishedWithPcOff?: boolean;
  readonly overlaySameShapeOnTwoFamilies?: boolean;
  readonly voiceInterruptWorks?: boolean;
}

export interface PhaseExitVerdict {
  ok: boolean;
  missing: string[];
}

type ResultFlag = Exclude<keyof PhaseExitResults, "flows" | "canaryHits">;
type Requirement =
  | { group?: undefined; key: ResultFlag; expected: boolean; label?: string }
  | { group: "flows"; key: Flow; expected: true; label?: never }
  | { group: "canaryHits"; key: CanaryPlace; expected: 0; label: string };

function freezeRequirements(...requirements: Requirement[]) {
  return Object.freeze(requirements.map((requirement) => Object.freeze(requirement)));
}

// 06-ROADMAP.md
// Phase 0 Exit check: `npm test` passes on the fork unchanged. The Playwright smoke test opens the app. A PR with a failing test cannot auto-merge. The `PAUSE_AUTOMERGE` file stops merging.
// Phase 1 Exit check: Playwright F1, F2 and F8 pass against the real app, with no mocks for the agent tool calls in the final run.
// Phase 2 Exit check: Playwright F3, F4 and F5 pass. The canary-secret test finds zero hits in model input, logs, bus and storage. A job finishes with the PC off.
// Phase 3 Exit check: Playwright F6 and F7 pass. The overlay fixture shows the same output shape on two families. Voice interrupt works.
const PHASE_EXIT_REQUIREMENTS = Object.freeze({
  0: freezeRequirements(
    { key: "npmTestPassed", expected: true },
    { key: "smokeOpensApp", expected: true },
    { key: "failingPrBlocked", expected: true },
    { key: "pauseFileStopsMerge", expected: true },
  ),
  1: freezeRequirements(
    { group: "flows", key: "F1", expected: true },
    { group: "flows", key: "F2", expected: true },
    { group: "flows", key: "F8", expected: true },
    { key: "agentToolCallsMocked", expected: false, label: "mocks-in-final-run" },
  ),
  2: freezeRequirements(
    { group: "flows", key: "F3", expected: true },
    { group: "flows", key: "F4", expected: true },
    { group: "flows", key: "F5", expected: true },
    { group: "canaryHits", key: "modelInput", expected: 0, label: "canary-model-input" },
    { group: "canaryHits", key: "logs", expected: 0, label: "canary-logs" },
    { group: "canaryHits", key: "bus", expected: 0, label: "canary-bus" },
    { group: "canaryHits", key: "storage", expected: 0, label: "canary-storage" },
    { key: "jobFinishedWithPcOff", expected: true },
  ),
  3: freezeRequirements(
    { group: "flows", key: "F6", expected: true },
    { group: "flows", key: "F7", expected: true },
    { key: "overlaySameShapeOnTwoFamilies", expected: true },
    { key: "voiceInterruptWorks", expected: true },
  ),
});

function readResult(report: unknown, key: string): unknown {
  if (typeof report !== "object" || report === null) return undefined;
  try {
    const property = Object.getOwnPropertyDescriptor(report, key);
    return property && Object.hasOwn(property, "value") ? property.value : undefined;
  } catch {
    // An unreadable report did not supply evidence for this check.
    return undefined;
  }
}

/** Evaluate reported results against the roadmap, in the order of its exit checks. */
export function checkPhaseExit(phase: unknown, results: unknown): PhaseExitVerdict {
  if (phase !== 0 && phase !== 1 && phase !== 2 && phase !== 3) {
    return { ok: false, missing: ["unknown-phase"] };
  }

  const missing: string[] = [];
  for (const requirement of PHASE_EXIT_REQUIREMENTS[phase]) {
    const report = requirement.group === undefined ? results : readResult(results, requirement.group);
    const value = readResult(report, requirement.key);
    if (value === requirement.expected) continue;

    if (requirement.group === "canaryHits" && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      missing.push(`${requirement.label}-not-reported`);
    } else {
      missing.push(requirement.label ?? requirement.key);
    }
  }
  return { ok: missing.length === 0, missing };
}
