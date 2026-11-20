export interface FillAttemptRequest {
  readonly origin: string;
  /** Broker-issued ID for a secret reference and its bound field. */
  readonly refId: string;
  readonly jobId: string;
}

export interface FillAttempt extends FillAttemptRequest {
  readonly outcome: "filled" | "login-ok" | "login-failed";
  /** Unix time in milliseconds. */
  readonly at: number;
}

export interface FillAttemptLimits {
  readonly maxFailures?: number;
  readonly failureWindowMs?: number;
  readonly repeatWindowMs?: number;
}

export interface FillAttemptDecision {
  decision: "allow" | "hold" | "refuse";
  reason: string;
  waitMs?: number;
}

export const DEFAULT_FILL_ATTEMPT_LIMITS = Object.freeze({
  maxFailures: 2,
  failureWindowMs: 15 * 60 * 1_000,
  repeatWindowMs: 5_000,
} satisfies Required<FillAttemptLimits>);

const requestFields = ["origin", "refId", "jobId"];
const historyFields = [...requestFields, "outcome", "at"];
const limitFields = Object.keys(DEFAULT_FILL_ATTEMPT_LIMITS);

function readFields(input: unknown, allowed: readonly string[]): Record<string, unknown> | undefined {
  if (input === null || typeof input !== "object") return;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return;

  const fields: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !allowed.includes(key)) return;
    const property = Object.getOwnPropertyDescriptor(input, key);
    if (!property || !("value" in property)) return;
    fields[key] = property.value;
  }
  return fields;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]+$/i.test(value);
}

function readTarget(fields: Record<string, unknown>): FillAttemptRequest | undefined {
  const { origin, refId, jobId } = fields;
  if (typeof origin !== "string" || !isId(refId) || !isId(jobId)) return;

  // Match the broker's HTTPS origin format, accepting any host casing.
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin.toLowerCase() || url.hostname.includes("*")) return;
  return { origin: url.origin, refId, jobId };
}

function isWholeNumber(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

/** Decide from metadata alone. The caller supplies the history and clock for each check. */
export function fillAttemptRule(
  history: unknown,
  request: unknown,
  now: number,
  limits?: unknown,
): FillAttemptDecision {
  const invalid: FillAttemptDecision = { decision: "refuse", reason: "Fill attempt information is invalid." };

  try {
    if (!Array.isArray(history) || !isWholeNumber(now, 0)) return invalid;
    const length = Object.getOwnPropertyDescriptor(history, "length")?.value;
    if (!isWholeNumber(length, 0) || Reflect.ownKeys(history).length !== length + 1) return invalid;

    const requestData = readFields(request, requestFields);
    const target = requestData && readTarget(requestData);
    const limitData = limits === undefined ? DEFAULT_FILL_ATTEMPT_LIMITS : readFields(limits, limitFields);
    if (!target || !limitData) return invalid;
    const {
      maxFailures = DEFAULT_FILL_ATTEMPT_LIMITS.maxFailures,
      failureWindowMs = DEFAULT_FILL_ATTEMPT_LIMITS.failureWindowMs,
      repeatWindowMs = DEFAULT_FILL_ATTEMPT_LIMITS.repeatWindowMs,
    } = limitData;
    if (!isWholeNumber(maxFailures, 1) || !isWholeNumber(failureWindowMs, 1) || !isWholeNumber(repeatWindowMs, 1)) {
      return invalid;
    }

    const logins: Pick<FillAttempt, "outcome" | "at">[] = [];
    let repeatWait = 0;
    for (let index = 0; index < length; index++) {
      const property = Object.getOwnPropertyDescriptor(history, String(index));
      if (!property || !("value" in property)) return invalid;
      const row = readFields(property.value, historyFields);
      if (!row) return invalid;

      const prior = readTarget(row);
      const { outcome, at } = row;
      if (!prior || !isWholeNumber(at, 0) || at > now) return invalid;
      if (outcome !== "filled" && outcome !== "login-ok" && outcome !== "login-failed") return invalid;
      if (prior.origin !== target.origin || prior.refId !== target.refId) continue;

      const age = now - at;
      if (outcome === "filled") {
        if (prior.jobId === target.jobId) repeatWait = Math.max(repeatWait, repeatWindowMs - age);
      } else if (age <= failureWindowMs) {
        logins.push({ outcome, at });
      }
    }

    let failures = 0;
    // Keep the caller's row order for events recorded in the same millisecond.
    for (const { outcome } of logins.sort((a, b) => a.at - b.at)) {
      failures = outcome === "login-ok" ? 0 : failures + 1;
    }
    if (failures >= maxFailures) {
      return { decision: "hold", reason: "Amit needs to review the failed logins before another fill." };
    }
    if (repeatWait > 0) {
      return { decision: "refuse", reason: "This field was already filled in this job.", waitMs: repeatWait };
    }
    return { decision: "allow", reason: "The fill can proceed." };
  } catch {
    return invalid;
  }
}
