import { MASK } from "../mask.js";

export const MAX_PAGE_MASK_AGE_MS = 1000;

interface PageReadScope {
  jobId: string;
  pageId: string;
  navigationId: number;
  frameIds: readonly string[];
}

export interface PageRead extends PageReadScope {
  url: string;
  readAt: number;
  text: string;
  maskOff?: { site: string; until: number } | null;
  hasSecretFields: boolean;
}

export interface PageMaskPass extends PageReadScope {
  maskedAt: number;
  knownCount: number;
}

const refusalMessages = {
  "no-mask-pass": "A valid mask pass is required for this page read.",
  "other-job": "The mask pass belongs to another browser job.",
  "page-changed": "The page read falls outside the page, navigation or site covered by the check.",
  "frames-changed": "The mask pass did not cover every frame in the page read.",
  stale: "The page read needs a fresh mask pass.",
  "mask-off-secret-fields": "Masking must stay on for pages with secret fields.",
  "mask-off-expired": "The allowance to turn off masking is no longer valid.",
  "marker-missing": "The page read is missing the expected mask marker.",
};

export type PageReadReleaseReason = keyof typeof refusalMessages;
export type PageReadReleaseDecision =
  | { release: true; text: string }
  | { release: false; reason: PageReadReleaseReason; message: string };

function refuse(reason: PageReadReleaseReason): PageReadReleaseDecision {
  return { release: false, reason, message: refusalMessages[reason] };
}

function matchesSite(address: string, site: string): boolean {
  try {
    const { host } = new URL(address);
    return host !== "" && host === site;
  } catch {
    return false;
  }
}

/** Checks a read before model or log release. All times are milliseconds from the same clock. */
export function pageReadRelease(
  read: Readonly<PageRead>,
  maskPass: Readonly<PageMaskPass> | null,
  now: number,
): PageReadReleaseDecision {
  if (!maskPass || !Number.isSafeInteger(maskPass.knownCount) || maskPass.knownCount < 0) {
    return refuse("no-mask-pass");
  }
  if (read.jobId !== maskPass.jobId) return refuse("other-job");
  if (read.pageId !== maskPass.pageId || read.navigationId !== maskPass.navigationId) {
    return refuse("page-changed");
  }

  const coveredFrames = new Set(maskPass.frameIds);
  if (read.frameIds.some((id) => !coveredFrames.has(id))) return refuse("frames-changed");

  const age = now - maskPass.maskedAt;
  if (!Number.isFinite(read.readAt) || !Number.isFinite(age) || maskPass.maskedAt < read.readAt ||
    age < 0 || age > MAX_PAGE_MASK_AGE_MS) {
    return refuse("stale");
  }

  if (read.maskOff) {
    if (read.hasSecretFields !== false) return refuse("mask-off-secret-fields");
    if (!Number.isFinite(read.maskOff.until) || now >= read.maskOff.until) return refuse("mask-off-expired");
    if (!matchesSite(read.url, read.maskOff.site)) return refuse("page-changed");
  }

  if (maskPass.knownCount > 0 && !read.text.includes(MASK)) return refuse("marker-missing");
  return { release: true, text: read.text };
}
