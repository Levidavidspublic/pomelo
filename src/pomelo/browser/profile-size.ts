import type { BrowserProfile } from "../browser-records.js";

const MB = 1024 * 1024;

export const LOCAL_PROFILE_WARN_BYTES = 1024 * MB;
export const LOCAL_PROFILE_HARD_BYTES = 2048 * MB;
export const CLOUD_PROFILE_WARN_BYTES = 256 * MB;
export const CLOUD_PROFILE_HARD_BYTES = 512 * MB;

const CACHE_FOLDERS = new Set(["cache", "code cache", "gpucache", "service worker/cachestorage"]);

export interface ProfileSizeReport extends Pick<BrowserProfile, "id" | "location"> {
  /** Profile-relative names and disjoint byte counts. Count CacheStorage separately from the rest of Service Worker. */
  folders: readonly { name: string; bytes?: number }[];
}

export type ProfileSizeResult = {
  totalBytes: number;
  freeableBytes: number;
  safeToClear: string[];
  message: string;
} & (
  | { verdict: "ok" | "warn"; reason?: never }
  | { verdict: "hold"; reason: "profile-too-big" | "bad-report" }
);

function badReport(): ProfileSizeResult {
  return {
    verdict: "hold",
    reason: "bad-report",
    totalBytes: 0,
    freeableBytes: 0,
    safeToClear: [],
    message: "The profile size report is incomplete or invalid. New jobs wait for a valid size report.",
  };
}

function formatMegabytes(bytes: number): string {
  if (bytes > 0 && bytes < MB) return "less than 1 MB";
  return `${Math.round(bytes / MB)} MB`;
}

export function checkProfileSize(report: ProfileSizeReport): ProfileSizeResult {
  if (!report || (report.location !== "local" && report.location !== "cloud") || !Array.isArray(report.folders)) {
    return badReport();
  }

  let totalBytes = 0;
  let freeableBytes = 0;
  const safeToClear: string[] = [];
  for (const folder of report.folders) {
    if (!folder || typeof folder.name !== "string" || !folder.name) return badReport();
    const { name, bytes } = folder;
    if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0) return badReport();

    totalBytes += bytes;
    if (CACHE_FOLDERS.has(name.toLowerCase())) {
      freeableBytes += bytes;
      safeToClear.push(name);
    }
  }
  if (!Number.isSafeInteger(totalBytes)) return badReport();

  safeToClear.sort();
  const sizes = { totalBytes, freeableBytes, safeToClear };
  const cache = freeableBytes > 0
    ? `Clearing cache can free ${formatMegabytes(freeableBytes)}.`
    : "The report shows no space to free by clearing cache.";
  const summary = `The profile uses ${formatMegabytes(totalBytes)}. ${cache} Other profile data uses ${formatMegabytes(totalBytes - freeableBytes)}.`;
  const cloud = report.location === "cloud";
  const hardBytes = cloud ? CLOUD_PROFILE_HARD_BYTES : LOCAL_PROFILE_HARD_BYTES;
  const warnBytes = cloud ? CLOUD_PROFILE_WARN_BYTES : LOCAL_PROFILE_WARN_BYTES;

  if (totalBytes > hardBytes) {
    return {
      ...sizes,
      verdict: "hold",
      reason: "profile-too-big",
      message: `The profile is over its hard limit. New jobs wait for Amit. ${summary}`,
    };
  }
  if (totalBytes > warnBytes) {
    return { ...sizes, verdict: "warn", message: `The profile is over its warning limit. ${summary}` };
  }
  return { ...sizes, verdict: "ok", message: summary };
}
