export interface DownloadInput {
  jobId: string;
  suggestedName: string;
  sizeBytes?: number | null;
  pageOrigin: string;
  maxBytes: number;
}

export type DownloadResult = { fileName: string } & (
  | { decision: "save"; relPath: string; reason: "ok" }
  | { decision: "hold"; relPath: string; reason: "program-type" | "size-limit" | "size-unknown" }
  | { decision: "refuse"; relPath: null; reason: "bad-job-id" }
);

const MAX_NAME_LENGTH = 120;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³])$/i;
const PROGRAM_ENDING = /\.(?:exe|msi|bat|cmd|ps1|sh|scr|dmg|pkg|app|jar|js|vbs|lnk)$/i;

function cleanName(suggestedName: string): string {
  const leaf = suggestedName.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "").split(/[\\/]/).at(-1) ?? "";
  // Strip a drive prefix and discard Windows alternate stream names.
  const name = leaf.replace(/[<>"|?*]/g, "").trimStart().replace(/^[a-z]:/i, "").split(":")[0];
  return name.trimStart()
    .replace(/\.{2,}/g, ".")
    .replace(/[.\s]+$/u, "");
}

function clipName(name: string, limit: number): string {
  return name.slice(0, limit).replace(/[\uD800-\uDBFF]$/u, "").replace(/[.\s]+$/u, "");
}

/** Decide using download metadata and return a path relative to FRIDAY_HOME. */
export function checkDownload({ jobId, suggestedName, sizeBytes, maxBytes }: DownloadInput): DownloadResult {
  const cleanedName = cleanName(suggestedName);
  let fileName = clipName(cleanedName, MAX_NAME_LENGTH) || "download";
  if (WINDOWS_DEVICE.test(fileName.split(".")[0].trimEnd())) {
    fileName = "_" + clipName(fileName, MAX_NAME_LENGTH - 1);
  }

  if (!jobId || /[^a-z0-9_-]/i.test(jobId)) {
    return { decision: "refuse", fileName, relPath: null, reason: "bad-job-id" };
  }

  const relPath = "downloads/" + jobId + "/" + fileName;
  if (PROGRAM_ENDING.test(cleanedName) || PROGRAM_ENDING.test(fileName)) {
    return { decision: "hold", fileName, relPath, reason: "program-type" };
  }
  if (sizeBytes == null || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    return { decision: "hold", fileName, relPath, reason: "size-unknown" };
  }
  if (!(sizeBytes <= maxBytes)) {
    return { decision: "hold", fileName, relPath, reason: "size-limit" };
  }
  return { decision: "save", fileName, relPath, reason: "ok" };
}
