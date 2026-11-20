type ProblemReason = readonly [CheckRunProblemCode, string];

const statusProblems = new Map<string, ProblemReason>([
  ["queued", ["queued", "is queued"]],
  ["in_progress", ["in_progress", "is still running"]],
]);

const conclusionProblems = new Map<string, ProblemReason>([
  ["skipped", ["skipped", "was skipped"]],
  ["neutral", ["neutral", "finished with a neutral result"]],
  ["cancelled", ["cancelled", "was cancelled"]],
  ["timed_out", ["timed_out", "timed out"]],
  ["failure", ["failed", "failed"]],
]);

export type CheckRunProblemCode =
  | "invalid_json"
  | "empty_required"
  | "missing"
  | "missing_head"
  | "older_commit"
  | "queued"
  | "in_progress"
  | "incomplete"
  | "skipped"
  | "neutral"
  | "cancelled"
  | "timed_out"
  | "failed"
  | "unsuccessful";

export interface CheckRunProblem {
  name: string | null;
  code: CheckRunProblemCode;
  message: string;
}

export interface CheckRunsResult {
  ok: boolean;
  problems: CheckRunProblem[];
}

interface RankedRun {
  time: number;
  startedAt: number;
  id: number;
  problem?: CheckRunProblem;
}

const absent = Number.NEGATIVE_INFINITY;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return absent;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : absent;
}

function problem(name: string, code: CheckRunProblemCode, reason: string): CheckRunProblem {
  return { name, code, message: `Required check "${name}" ${reason}.` };
}

function runProblem(run: Record<string, unknown>, name: string, headSha: string): CheckRunProblem | undefined {
  if (typeof run.head_sha !== "string" || !run.head_sha.trim()) {
    return problem(name, "missing_head", "has no commit ID");
  }
  if (run.head_sha !== headSha) return problem(name, "older_commit", "ran on a different commit");
  if (run.status !== "completed") {
    const knownStatus = typeof run.status === "string" ? statusProblems.get(run.status) : undefined;
    const [code, reason] = knownStatus ?? ["incomplete", "has not completed"];
    return problem(name, code, reason);
  }
  if (run.conclusion === "success") return;
  const knownConclusion = typeof run.conclusion === "string" ? conclusionProblems.get(run.conclusion) : undefined;
  const [code, reason] = knownConclusion ?? ["unsuccessful", "did not report success"];
  return problem(name, code, reason);
}

function isNewer(run: RankedRun, previous: RankedRun): boolean {
  if (run.time !== previous.time) return run.time > previous.time;
  if (run.startedAt !== previous.startedAt) return run.startedAt > previous.startedAt;
  if (run.id !== previous.id) return run.id > previous.id;
  return !!run.problem && !previous.problem;
}

function newestRun(runs: RankedRun[]): RankedRun | undefined {
  let dated: RankedRun | undefined;
  let undated: RankedRun | undefined;
  for (const run of runs) {
    if (run.time === absent) {
      if (!undated || isNewer(run, undated)) undated = run;
    } else if (!dated || isNewer(run, dated)) {
      dated = run;
    }
  }
  if (!dated || !undated) return dated ?? undated;

  // A queued rerun may have no timestamps yet. Compare IDs in that case.
  if (dated.id !== absent && undated.id !== absent && dated.id !== undated.id) {
    return dated.id > undated.id ? dated : undated;
  }
  return dated.problem ? dated : undated;
}

/** Evaluate the latest run of each required check against the PR head. */
export function checkRuns(jsonText: string, headSha: string, required: readonly string[]): CheckRunsResult {
  if (required.length === 0) {
    return { ok: false, problems: [{ name: null, code: "empty_required", message: "No required checks were listed." }] };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return { ok: false, problems: [{ name: null, code: "invalid_json", message: "Check runs could not be read as JSON." }] };
  }
  const runs = isRecord(payload) ? payload.check_runs : payload;
  if (!Array.isArray(runs)) {
    return { ok: false, problems: [{ name: null, code: "invalid_json", message: "Check runs JSON must contain a list of runs." }] };
  }

  const names = [...new Set(required)].sort();
  const runsByName = new Map<string, RankedRun[]>(names.map(name => [name, []]));
  for (const run of runs) {
    if (!isRecord(run) || typeof run.name !== "string") continue;
    const matches = runsByName.get(run.name);
    if (!matches) continue;
    const startedAt = timestamp(run.started_at);
    const completedAt = timestamp(run.completed_at);
    matches.push({
      time: completedAt === absent ? startedAt : completedAt,
      startedAt,
      id: typeof run.id === "number" && Number.isSafeInteger(run.id) ? run.id : absent,
      problem: runProblem(run, run.name, headSha),
    });
  }

  const problems: CheckRunProblem[] = [];
  for (const name of names) {
    const run = newestRun(runsByName.get(name) ?? []);
    if (!run) problems.push(problem(name, "missing", "is missing"));
    else if (run.problem) problems.push(run.problem);
  }
  return { ok: problems.length === 0, problems };
}
