export const DEFAULT_SETTLE_MS = 350;
export const DEFAULT_MAX_WAIT_MS = 12_000;

export interface PageReadyFacts {
  step: "read" | "click" | "fill";
  navigationStartedAt: number;
  domContentLoaded: boolean;
  loadEventFired: boolean;
  openRequests: number;
  lastNetworkActivityAt: number;
  lastLayoutChangeAt: number;
  targetPresent: boolean;
  targetVisible: boolean;
  targetEnabled: boolean;
}

export interface PageReadyLimits {
  settleMs: number;
  maxWaitMs: number;
}

type TargetReason = "target_missing" | "target_hidden" | "target_disabled";

export type PageReadyDecision =
  | { action: "go"; reason: "page_ready" }
  | { action: "wait"; reason: "page_settling" | TargetReason }
  | { action: "hold"; reason: "bad_input" | "page_never_settled" | "wait_limit_reached" | TargetReason };

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * All times are milliseconds and timestamps share a clock. Use navigationStartedAt
 * for either activity timestamp until its first event is observed.
 */
export function pageReady(
  facts: PageReadyFacts,
  now: number,
  limits: PageReadyLimits = { settleMs: DEFAULT_SETTLE_MS, maxWaitMs: DEFAULT_MAX_WAIT_MS },
): PageReadyDecision {
  if (!facts || !limits) return { action: "hold", reason: "bad_input" };
  const { step, navigationStartedAt, domContentLoaded, loadEventFired, openRequests,
    lastNetworkActivityAt, lastLayoutChangeAt, targetPresent, targetVisible, targetEnabled } = facts;
  const { settleMs, maxWaitMs } = limits;

  if (!isTime(now) || !isTime(settleMs) || !isTime(maxWaitMs)
    || [navigationStartedAt, lastNetworkActivityAt, lastLayoutChangeAt].some((time) => !isTime(time) || time > now)
    || !Number.isSafeInteger(openRequests) || openRequests < 0
    || (step !== "read" && step !== "click" && step !== "fill")
    || [domContentLoaded, loadEventFired, targetPresent, targetVisible, targetEnabled].some((fact) => typeof fact !== "boolean")) {
    return { action: "hold", reason: "bad_input" };
  }

  const expired = now - navigationStartedAt >= maxWaitMs;
  if (step !== "read") {
    const action = expired ? "hold" : "wait";
    if (!targetPresent) return { action, reason: "target_missing" };
    if (!targetVisible) return { action, reason: "target_hidden" };
    if (!targetEnabled) return { action, reason: "target_disabled" };
  }

  const networkQuietSince = Math.max(navigationStartedAt, lastNetworkActivityAt);
  const networkSettled = openRequests === 0 && now - networkQuietSince >= settleMs;
  const layoutSettled = now - lastLayoutChangeAt >= settleMs;
  const pageSettled = loadEventFired && networkSettled && (step !== "fill" || layoutSettled);
  if (!domContentLoaded || (step !== "read" && !pageSettled)) {
    return expired
      ? { action: "hold", reason: "page_never_settled" }
      : { action: "wait", reason: "page_settling" };
  }

  if (expired) return { action: "hold", reason: "wait_limit_reached" };
  return { action: "go", reason: "page_ready" };
}
