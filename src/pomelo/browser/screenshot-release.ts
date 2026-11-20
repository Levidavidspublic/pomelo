export interface ShotFacts {
  url: string;
  navigationId: number;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  /** Milliseconds at capture or mask computation, using the same time origin for both. */
  timestamp: number;
}

export interface MaskPass extends ShotFacts {
  /** Number of secret or broker-filled fields found. */
  fieldsFound: number;
  rectanglesApplied: number;
  maskingEnabled: boolean;
}

export type ReleaseReason = "mask-off" | "no-mask-pass" | "page-changed" | "resized" | "scrolled" | "stale" | "uncovered";

type ReleaseDecision = { release: true } | { release: false; reason: ReleaseReason; retry: boolean };

export const MAX_MASK_AGE_MS = 500;

function validNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validFacts(facts: Readonly<ShotFacts>): boolean {
  return [
    facts.navigationId,
    facts.scrollX,
    facts.scrollY,
    facts.viewportWidth,
    facts.viewportHeight,
    facts.devicePixelRatio,
    facts.timestamp,
  ].every(validNumber);
}

function sameAddress(shotAddress: string, passAddress: string): boolean {
  try {
    const shotUrl = new URL(shotAddress);
    const passUrl = new URL(passAddress);
    // The navigation counter covers same-document navigation. Preserve the query in the address comparison.
    shotUrl.hash = "";
    passUrl.hash = "";
    return shotUrl.href === passUrl.href;
  } catch {
    return false;
  }
}

/** Checks whether a mask pass still applies to a screenshot before it can be released. */
export function screenshotRelease(shot: Readonly<ShotFacts>, maskPass?: Readonly<MaskPass> | null): ReleaseDecision {
  if (maskPass?.maskingEnabled === false && Number.isFinite(maskPass.fieldsFound) && maskPass.fieldsFound > 0) {
    return { release: false, reason: "mask-off", retry: false };
  }
  if (
    !maskPass || typeof maskPass.maskingEnabled !== "boolean" || !validFacts(shot) || !validFacts(maskPass) ||
    !validNumber(maskPass.fieldsFound) || !validNumber(maskPass.rectanglesApplied)
  ) {
    return { release: false, reason: "no-mask-pass", retry: true };
  }
  if (shot.navigationId !== maskPass.navigationId || !sameAddress(shot.url, maskPass.url)) {
    return { release: false, reason: "page-changed", retry: true };
  }
  if (
    shot.viewportWidth !== maskPass.viewportWidth || shot.viewportHeight !== maskPass.viewportHeight ||
    shot.devicePixelRatio !== maskPass.devicePixelRatio
  ) {
    return { release: false, reason: "resized", retry: true };
  }
  if (shot.scrollX !== maskPass.scrollX || shot.scrollY !== maskPass.scrollY) {
    return { release: false, reason: "scrolled", retry: true };
  }
  const age = shot.timestamp - maskPass.timestamp;
  if (age < 0 || age > MAX_MASK_AGE_MS) {
    return { release: false, reason: "stale", retry: true };
  }
  if (maskPass.rectanglesApplied < maskPass.fieldsFound) {
    return { release: false, reason: "uncovered", retry: false };
  }
  return { release: true };
}
