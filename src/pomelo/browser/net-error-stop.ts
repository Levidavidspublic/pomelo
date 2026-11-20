export interface NetErrorFacts {
  code?: string | null;
  mainFrame: boolean;
  /** Includes the failed load being checked. The first failed load is try 1. */
  triesSoFar: number;
  fillInFlight: boolean;
  importInFlight: boolean;
  runner: "pc" | "vps";
}

export type NetErrorDecision = { reason: string; countsAsDone: false } & (
  | { verdict: "retry"; waitMs: number }
  | { verdict: "hold" | "not_network" }
);

const RETRY_WAITS_MS = [2_000, 10_000, 30_000] as const;
export const NET_ERROR_MAX_TRIES = RETRY_WAITS_MS.length;

const DISCONNECTED = "ERR_INTERNET_DISCONNECTED";
const DNS_FAILURE = "ERR_NAME_NOT_RESOLVED";
const TRANSIENT_CODES = new Set([
  DISCONNECTED,
  "ERR_NETWORK_CHANGED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_TIMED_OUT",
  "ERR_CONNECTION_REFUSED",
]);

/** Classifies a browser load failure. The caller tracks tries and performs any retry. */
export function netErrorStop(facts: NetErrorFacts): NetErrorDecision {
  const countsAsDone = false;
  const notNetwork = {
    verdict: "not_network", reason: "Another rule can review this load failure.", countsAsDone,
  } as const;

  try {
    if (facts?.mainFrame !== true) return notNetwork;
    const { code: rawCode } = facts;
    if (typeof rawCode !== "string") return notNetwork;

    const code = rawCode.toUpperCase().replace(/^NET::/, "");
    const dnsFailure = code === DNS_FAILURE;
    if (!dnsFailure && !TRANSIENT_CODES.has(code)) return notNetwork;

    const { triesSoFar, fillInFlight, importInFlight, runner } = facts;
    if (fillInFlight === true || importInFlight === true) {
      return { verdict: "hold", reason: "The site may be half done", countsAsDone };
    }

    const retryLimit = dnsFailure ? 1 : NET_ERROR_MAX_TRIES;
    if (Number.isSafeInteger(triesSoFar) && triesSoFar >= 1 && triesSoFar <= retryLimit) {
      return {
        verdict: "retry",
        waitMs: RETRY_WAITS_MS[triesSoFar - 1],
        reason: "The site could not be reached. Wait and try again.",
        countsAsDone,
      };
    }

    if (dnsFailure) {
      return { verdict: "hold", reason: "The address could not be found. It may be mistyped", countsAsDone };
    }
    if (code === DISCONNECTED && runner === "vps") {
      return { verdict: "hold", reason: "The VPS browser has no network", countsAsDone };
    }
    return { verdict: "hold", reason: `The site could not be reached after ${NET_ERROR_MAX_TRIES} tries`, countsAsDone };
  } catch {
    // A malformed fact object can throw when its properties are read.
    return notNetwork;
  }
}
