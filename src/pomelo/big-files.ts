export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  bytes: number;
  binary: boolean;
}

export interface BigFileLimits {
  textBytes: number;
  binaryBytes: number;
}

export type BigFileReason = "profile-data" | "binary" | "build-or-media" | "too-large" | "bad-input";

export interface BigFileFinding {
  path: string;
  reason: BigFileReason;
  bytes: number;
}

export interface BigFileResult {
  ok: boolean;
  findings: BigFileFinding[];
}

export const DEFAULT_LIMITS: Readonly<BigFileLimits> = Object.freeze({
  textBytes: 200 * 1024,
  binaryBytes: 0,
});

const MAX_BYTES = 1024 * 1024;
const BINARY_LIMIT_FOLDERS = ["src/pomelo/", "src/client/pomelo/", "test/"];
const BUILD_OR_MEDIA_EXTENSIONS = [".map", ".min.js", ".zip", ".tgz", ".mp4", ".mov", ".sqlite", ".db", ".dmg", ".exe", ".node"];
const STATUSES = new Set(["added", "modified", "deleted", "renamed"]);

function isByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isChangedFile(value: unknown): value is ChangedFile {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const { path, status, bytes, binary } = value as Partial<ChangedFile>;
  return typeof path === "string" && typeof status === "string" && STATUSES.has(status)
    && isByteCount(bytes) && typeof binary === "boolean";
}

function badInput(): BigFileResult {
  return { ok: false, findings: [{ path: "", reason: "bad-input", bytes: 0 }] };
}

export function findBigFiles(files: unknown, limits: Partial<BigFileLimits> = {}): BigFileResult {
  if (!Array.isArray(files) || limits === null || typeof limits !== "object" || Array.isArray(limits)) {
    return badInput();
  }
  const { textBytes = DEFAULT_LIMITS.textBytes, binaryBytes = DEFAULT_LIMITS.binaryBytes } = limits;
  if (!isByteCount(textBytes) || !isByteCount(binaryBytes)) return badInput();

  const textLimit = Math.min(textBytes, MAX_BYTES);
  const binaryLimit = Math.min(binaryBytes, MAX_BYTES);
  const findings: BigFileFinding[] = [];

  for (const file of files) {
    if (!isChangedFile(file)) return badInput();
    const path = file.path.replaceAll("\\", "/");
    const segments = path.split("/");
    if (path.includes("\0") || /^[a-z]:\//i.test(path)
      || segments.some((segment) => segment === "" || segment === "." || segment === "..")) return badInput();

    const { status, bytes, binary } = file;
    if (status === "deleted" || status === "renamed") continue;

    const name = segments.pop();
    const isProfileData = name === "Cookies" || name === "Login Data"
      || segments.some((segment) => segment === "profiles" || segment === "artifacts");
    const hasBinaryLimit = binary && BINARY_LIMIT_FOLDERS.some((folder) => path.startsWith(folder));
    const lowercasePath = path.toLowerCase();

    let reason: BigFileReason;
    if (status === "added" && isProfileData) {
      reason = "profile-data";
    } else if (hasBinaryLimit && (binaryLimit === 0 || bytes > binaryLimit)) {
      reason = "binary";
    } else if (status === "added" && BUILD_OR_MEDIA_EXTENSIONS.some((extension) => lowercasePath.endsWith(extension))) {
      reason = "build-or-media";
    } else if (!hasBinaryLimit && bytes > textLimit) {
      reason = "too-large";
    } else {
      continue;
    }
    findings.push({ path, reason, bytes });
  }

  findings.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: findings.length === 0, findings };
}
