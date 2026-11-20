import type { MainCommit } from "./main-red.js";

interface RankedRun {
  time: number;
  startedAt: number;
  id: number;
  conclusion: string | null;
}

const absent = Number.NEGATIVE_INFINITY;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRuns(jsonText: string): unknown[] | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return;
  }
  const runs = isRecord(payload) ? payload.check_runs : payload;
  return Array.isArray(runs) ? runs : undefined;
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return absent;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : absent;
}

// Keep the ordering in sync with newestRun in check-runs.ts.
function isNewer(run: RankedRun, previous: RankedRun): boolean {
  if (run.time !== previous.time) return run.time > previous.time;
  if (run.startedAt !== previous.startedAt) return run.startedAt > previous.startedAt;
  if (run.id !== previous.id) return run.id > previous.id;
  return run.conclusion !== "success" && previous.conclusion === "success";
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

  // A queued rerun may have no timestamps yet.
  if (dated.id !== absent && undated.id !== absent && dated.id !== undated.id) {
    return dated.id > undated.id ? dated : undated;
  }
  return dated.conclusion === "success" ? undated : dated;
}

/** Build the input to mainHealth from one main commit's check runs. */
export function mainCommitFromCheckRuns(
  sha: string, pr: number | null, jsonText: string, required: readonly string[],
): MainCommit {
  const runs = readRuns(jsonText);
  if (!runs || required.length === 0) return { sha, pr, checks: [{ conclusion: null }] };

  const runsByName = new Map<string, RankedRun[]>();
  for (const name of new Set(required)) runsByName.set(name, []);

  for (const run of runs) {
    if (!isRecord(run) || run.head_sha !== sha || typeof run.name !== "string") continue;
    const matches = runsByName.get(run.name);
    if (!matches) continue;
    const startedAt = timestamp(run.started_at);
    const completedAt = timestamp(run.completed_at);
    matches.push({
      time: completedAt === absent ? startedAt : completedAt,
      startedAt,
      id: typeof run.id === "number" && Number.isSafeInteger(run.id) ? run.id : absent,
      conclusion: run.status === "completed" && typeof run.conclusion === "string" ? run.conclusion : null,
    });
  }

  const checks = Array.from(runsByName.values(), matches => ({ conclusion: newestRun(matches)?.conclusion ?? null }));
  return { sha, pr, checks };
}
