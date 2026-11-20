export interface ApiQuotaOptions {
  /** Wait below this number of calls. Defaults to 50. */
  waitBelow?: number;
  /** Slow down below this fraction of a block's limit. Defaults to 0.2. */
  slowBelowRatio?: number;
}

export interface ApiQuotaBlock {
  name: "core" | "graphql";
  remaining: number;
  limit: number;
}

export type ApiQuotaResult = { reason: string } & (
  | { verdict: "go" | "slow" | "wait"; waitMs: number; lowest: ApiQuotaBlock }
  | { verdict: "unreadable"; waitMs: 0; lowest: null }
);

const MAX_WAIT_MS = 60 * 60 * 1_000;

function readObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readBlock(value: unknown, name: ApiQuotaBlock["name"]) {
  const block = readObject(value);
  if (!block) return undefined;
  const { remaining, limit, reset } = block;
  if (typeof remaining !== "number" || !Number.isFinite(remaining) ||
      typeof limit !== "number" || !Number.isFinite(limit) ||
      typeof reset !== "number" || !Number.isFinite(reset)) return undefined;
  return { name, remaining, limit, reset };
}

function unreadable(reason: string): ApiQuotaResult {
  return { verdict: "unreadable", waitMs: 0, lowest: null, reason };
}

/** Check a rate-limit response at the supplied time in milliseconds. */
export function checkApiQuota(
  jsonText: string,
  nowMs: number,
  { waitBelow = 50, slowBelowRatio = 0.2 }: ApiQuotaOptions = {},
): ApiQuotaResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return unreadable("The GitHub rate-limit response is invalid JSON.");
  }

  const resources = readObject(readObject(parsed)?.resources);
  const core = readBlock(resources?.core, "core");
  const graphql = readBlock(resources?.graphql, "graphql");
  if (!core || !graphql) return unreadable("The GitHub rate-limit response needs numeric core and graphql quotas.");
  if (!Number.isFinite(nowMs)) return unreadable("The supplied time must be a finite number.");

  const { name, remaining, limit } = core.remaining <= graphql.remaining ? core : graphql;
  const lowest = { name, remaining, limit };
  let wait: typeof core | undefined;
  let slow: typeof core | undefined;
  for (const block of [core, graphql]) {
    if (block.reset * 1_000 <= nowMs) continue;
    if (block.remaining < waitBelow) {
      // If both quotas are low, the later reset is when both have cleared.
      if (!wait || block.reset > wait.reset) wait = block;
    } else if (block.remaining < block.limit * slowBelowRatio) {
      slow ??= block;
    }
  }

  if (wait) {
    const waitMs = Math.min(wait.reset * 1_000 - nowMs, MAX_WAIT_MS);
    return { verdict: "wait", waitMs, lowest, reason: `${wait.name} has fewer than ${waitBelow} calls left.` };
  }
  if (slow) {
    return { verdict: "slow", waitMs: 0, lowest, reason: `${slow.name} is below its quota warning threshold.` };
  }
  return { verdict: "go", waitMs: 0, lowest, reason: "Neither active quota is below its thresholds." };
}
