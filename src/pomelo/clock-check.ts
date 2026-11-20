export interface ClockCheckInput {
  readonly timedatectlText?: string;
  readonly localNowMs: number;
  readonly remoteDateText?: string;
}

export interface ClockCheckResult {
  verdict: "go" | "wait" | "stop";
  reasons: string[];
  /** Local time minus GitHub time, in seconds. */
  skewSeconds: number | null;
}

const WAIT_SKEW_SECONDS = 30;
const STOP_SKEW_SECONDS = 5 * 60;

function readSynchronization(text: string | undefined): boolean | null {
  if (typeof text !== "string") return null;

  let synchronized: boolean | null = null;
  for (const row of text.split(/\r?\n/)) {
    const line = row.trim();
    if (!line) continue;

    const property = /^([A-Za-z][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!property) return null;
    const [, key, value] = property;
    if (key !== "NTPSynchronized") continue;
    if (synchronized !== null || (value !== "yes" && value !== "no")) return null;
    synchronized = value === "yes";
  }
  return synchronized;
}

/** Check supplied clock readings before using the local clock to judge ages. */
export function clockCheck({ timedatectlText, localNowMs, remoteDateText }: ClockCheckInput): ClockCheckResult {
  const synchronized = readSynchronization(timedatectlText);
  const dateText = typeof remoteDateText === "string" ? remoteDateText.trim() : "";
  const remoteNowMs = Date.parse(dateText);
  // Round-trip the HTTP date to reject values that Date.parse accepts or normalizes permissively.
  const remoteReadable = Number.isFinite(remoteNowMs) && new Date(remoteNowMs).toUTCString() === dateText;
  const localReadable = Number.isFinite(localNowMs);
  const skewSeconds = localReadable && remoteReadable ? (localNowMs - remoteNowMs) / 1_000 : null;

  const reasons: string[] = [];
  if (synchronized === null) {
    reasons.push("Could not read the local clock status from timedatectl show (NTPSynchronized).");
  } else if (!synchronized) {
    reasons.push("The local clock is not synchronized (NTPSynchronized=no).");
  }
  if (!localReadable) reasons.push("Could not read the local clock timestamp.");
  if (!remoteReadable) reasons.push("Could not read GitHub's Date header.");

  const skewMagnitude = Math.abs(skewSeconds ?? 0);
  if (skewSeconds !== null && skewMagnitude > WAIT_SKEW_SECONDS) {
    const direction = skewSeconds > 0 ? "ahead of" : "behind";
    reasons.push(`The local clock is ${skewMagnitude} seconds ${direction} GitHub's clock.`);
  }

  if (synchronized === null || skewSeconds === null || skewMagnitude > STOP_SKEW_SECONDS) {
    return { verdict: "stop", reasons, skewSeconds };
  }
  return { verdict: reasons.length ? "wait" : "go", reasons, skewSeconds };
}
