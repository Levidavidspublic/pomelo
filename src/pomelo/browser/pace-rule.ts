import type { BrowserAction } from "../../browser-driver.js";

export interface PaceLimits {
  minGapMs: number;
  maxLoadsPerMinute: number;
  maxRetryAfterMs: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  /** Consecutive 429 or 503 responses that require Amit's review. */
  holdAfter: number;
}

export interface PaceHistoryEntry {
  host: string;
  action: BrowserAction;
  /** Epoch milliseconds. Use the response time when recording a status. */
  at: number;
  status?: number;
  retryAfterSec?: number;
}

export interface PaceInput {
  /** A hostname or an HTTP(S) address. */
  host: string;
  action: BrowserAction;
  now: number;
  /** For entries at the same millisecond, supply the earlier action first. */
  history: readonly PaceHistoryEntry[];
  limits: PaceLimits;
}

export type PaceResult =
  | { verdict: "go"; host: string }
  | { verdict: "wait"; host: string; waitMs: number }
  | { verdict: "hold"; host: string | null; reason: string };

const MINUTE_MS = 60_000;

function hostname(value: string): string {
  const address = value.trim();
  try {
    const url = new URL(/^[a-z][\w+.-]*:\/\//i.test(address) ? address : `https://${address}`);
    if (url.protocol === "http:" || url.protocol === "https:") return url.hostname.replace(/\.$/, "");
  } catch {
    // A malformed address must never be copied into a decision.
  }
  return "";
}

function isPageRead(action: BrowserAction): boolean {
  return action === "read" || action === "screenshot";
}

function isThrottleResponse(status: number): boolean {
  return status === 429 || status === 503;
}

/** Apply the pace limits to this job's actions on one exact hostname. */
export function paceDecision({ host: target, action, now, history, limits }: PaceInput): PaceResult {
  const host = hostname(target);
  if (!host) return { verdict: "hold", host: null, reason: "Amit needs to review the site's address." };
  if (isPageRead(action)) return { verdict: "go", host };

  // Other actions can cause a load, including clicks and input events on the open page.
  const loads = history
    .filter((entry) => !isPageRead(entry.action) && Number.isFinite(entry.at) && entry.at <= now && hostname(entry.host) === host)
    .sort((a, b) => a.at - b.at);

  let latestThrottle: PaceHistoryEntry | undefined;
  let consecutive = 0;
  for (let index = loads.length - 1; index >= 0; index--) {
    const entry = loads[index];
    if (entry.status === undefined) continue;
    if (!isThrottleResponse(entry.status)) break;
    latestThrottle ??= entry;
    consecutive++;
    if (consecutive >= limits.holdAfter) {
      return { verdict: "hold", host, reason: "The site returned repeated 429 or 503 responses. Amit needs to review the job." };
    }
  }

  let retryWait = 0;
  if (latestThrottle) {
    const retryAfterSec = latestThrottle.retryAfterSec ?? NaN;
    const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec >= 0 && retryAfterSec <= limits.maxRetryAfterMs / 1_000
      ? retryAfterSec * 1_000
      : Math.min(limits.maxBackoffMs, limits.baseBackoffMs * 2 ** (consecutive - 1));
    retryWait = delayMs - (now - latestThrottle.at);
  }

  const latestLoad = loads.at(-1);
  const gapWait = latestLoad ? limits.minGapMs - (now - latestLoad.at) : 0;
  // A new load needs a free slot, even if history already exceeds the cap.
  const loadToExpire = loads.at(-limits.maxLoadsPerMinute);
  const minuteWait = loadToExpire ? MINUTE_MS - (now - loadToExpire.at) : 0;
  const waitMs = Math.ceil(Math.max(gapWait, minuteWait, retryWait));
  return waitMs > 0 ? { verdict: "wait", host, waitMs } : { verdict: "go", host };
}
