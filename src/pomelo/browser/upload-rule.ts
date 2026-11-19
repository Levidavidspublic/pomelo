import { posix, win32 } from "node:path";

export const UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;

export interface UploadRequest {
  filePath: string;
  jobFolder: string;
  fridayHome: string;
  bytes: number;
  origin: string;
  approvedPaths?: string[];
}

export type UploadReason =
  | "in-job-folder" | "approved" | "inside-friday-home" | "secret-store"
  | "needs-amit" | "too-large" | "insecure-origin" | "bad-input";

export interface UploadDecision {
  decision: "allow" | "hold" | "refuse";
  reason: UploadReason;
  name?: string;
}

type PathStyle = typeof posix | typeof win32;

type NormalizedPath = {
  style: PathStyle;
  value: string;
};

const secretStore = /^(?:\.ssh|\.gnupg|\.aws|\.env(?:\..*)?|id_rsa|id_ed25519|Cookies|Login Data|.*\.(?:pem|key|kdbx))$/is;

function normalizePath(input: unknown, defaultStyle?: PathStyle): NormalizedPath | undefined {
  if (typeof input !== "string" || !input.trim() || input.includes("\0")) return undefined;

  const separated = input.replaceAll("\\", "/");
  const drive = /^[a-z]:/i.test(separated);
  const unc = defaultStyle !== posix && /^\/\/[^/]/.test(separated);
  if (!drive && !unc && defaultStyle !== win32) return { style: posix, value: posix.normalize(separated) };

  // Drive-relative names rely on ambient state. Win32 can also reinterpret spaces,
  // dots and device/stream syntax after node:path has normalized the string.
  if (drive && separated[2] !== "/") return undefined;
  const components = (drive ? separated.slice(2) : separated).split("/");
  if (unc) {
    const [, , server, share] = components;
    if (!share || server === "." || server === ".." || share === "." || share === "..") return undefined;
  }
  if (components.some((part) => /[:?*"<>|]/.test(part) || (part !== "." && part !== ".." && /[ .]$/.test(part)))) {
    return undefined;
  }
  return { style: win32, value: win32.normalize(separated) };
}

function isFullyQualified({ style, value }: NormalizedPath): boolean {
  return style.isAbsolute(value) && (style === posix || win32.parse(value).root !== "\\");
}

function relativeTo(folder: NormalizedPath, file: NormalizedPath): string | undefined {
  if (folder.style !== file.style || !isFullyQualified(file)) return undefined;
  return file.style.relative(folder.value, file.value);
}

function isInside(relative: string | undefined, style: PathStyle): boolean {
  return !!relative && relative !== ".." && !relative.startsWith(`..${style.sep}`) && !style.isAbsolute(relative);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d+){3}$/.test(hostname);
}

export function uploadDecision(request: UploadRequest): UploadDecision {
  const badInput: UploadDecision = { decision: "refuse", reason: "bad-input" };
  try {
    const { filePath, jobFolder, fridayHome, bytes, origin, approvedPaths = [] } = request;
    if (!Number.isSafeInteger(bytes) || bytes < 0 || typeof origin !== "string" || origin.includes("\0") ||
      !Array.isArray(approvedPaths)) return badInput;
    const url = new URL(origin);

    const job = normalizePath(jobFolder);
    const home = normalizePath(fridayHome);
    if (!job || !home || !isFullyQualified(job) || !isFullyQualified(home)) return badInput;

    // The folders disambiguate slash-only paths and Windows paths without a drive.
    const defaultStyle = job.style === home.style ? job.style : undefined;
    const file = normalizePath(filePath, defaultStyle);
    if (!file) return badInput;
    const { style, value } = file;
    const name = style.basename(value);
    if (!name || name === "." || name === ".." || value === style.parse(value).root) return badInput;

    let approved = false;
    for (const approvedPath of approvedPaths) {
      const candidate = normalizePath(approvedPath, defaultStyle);
      if (!candidate) return badInput;
      if (isFullyQualified(candidate) && relativeTo(candidate, file) === "") approved = true;
    }

    if (value.split(style.sep).some((part) => secretStore.test(part))) {
      return { decision: "refuse", reason: "secret-store", name };
    }
    const inJob = isInside(relativeTo(job, file), style);
    const fromHome = relativeTo(home, file);
    if (!inJob && (fromHome === "" || isInside(fromHome, style))) {
      return { decision: "refuse", reason: "inside-friday-home", name };
    }
    if (bytes > UPLOAD_LIMIT_BYTES) return { decision: "hold", reason: "too-large", name };
    if (url.protocol !== "https:" && !isLoopback(url.hostname)) {
      return { decision: "hold", reason: "insecure-origin", name };
    }
    if (inJob) return { decision: "allow", reason: "in-job-folder", name };
    if (approved) return { decision: "allow", reason: "approved", name };
    return { decision: "hold", reason: "needs-amit", name };
  } catch {
    return badInput;
  }
}
