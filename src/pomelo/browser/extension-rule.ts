import { posix, win32 } from "node:path";
import { importSitePatterns } from "../import-sites.js";

export const COMPANION_API_PERMISSIONS: readonly string[] = Object.freeze(["cookies"]);

type ExtensionDecision = { id: string | null; decision: "allow" | "refuse"; reason: string };

export type ProfileExtensionResult = { extensions: ExtensionDecision[] } & (
  | { decision: "start" }
  | { decision: "hold"; reason: string }
);

function field(input: unknown, key: PropertyKey): unknown {
  if (input !== null && typeof input === "object") {
    return Object.getOwnPropertyDescriptor(input, key)?.value;
  }
}

function list(input: unknown): unknown[] | undefined {
  if (Array.isArray(input)) {
    return Array.from({ length: input.length }, (_, index) => field(input, index));
  }
}

function strings(input: unknown): string[] | undefined {
  const entries = list(input);
  if (entries?.every((entry) => typeof entry === "string")) return entries;
}

function extensionId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : null;
}

function folderPath(value: unknown): string | undefined {
  if (typeof value !== "string" || /[\x00-\x1f]/.test(value)) return undefined;
  const separated = value.replaceAll("\\", "/");
  const drive = /^[a-z]:\//i.test(separated);
  const unc = /^\/\/[^/]/.test(separated);
  if (!drive && !unc) {
    if (posix.isAbsolute(separated)) return posix.normalize(separated).replace(/\/$/, "") || "/";
    return undefined;
  }

  const parts = (drive ? separated.slice(3) : separated.slice(2)).split("/");
  if (unc && (!parts[1] || parts.slice(0, 2).some((part) => part === "." || part === ".."))) return undefined;
  if (parts.some((part) => /[:?*"<>|]/.test(part) || (part !== "." && part !== ".." && /[ .]$/.test(part)))) {
    return undefined;
  }
  const normalized = win32.normalize(separated).replaceAll("\\", "/").replace(/\/$/, "");
  // Preserve directory case for Windows folders that have case sensitivity enabled.
  return drive ? normalized[0].toLowerCase() + normalized.slice(1) : normalized;
}

function hold(reason: string, extensions: ExtensionDecision[] = []): ProfileExtensionResult {
  return { decision: "hold", reason: `Hold for Amit. ${reason}`, extensions };
}

function refuse(id: string | null, reason: string): ExtensionDecision {
  const label = id ? `Extension ${id}` : "An extension with an invalid id";
  return { id, decision: "refuse", reason: `${label} ${reason}` };
}

function checkExtension(
  entry: unknown, id: string | null, companionId: string, folder: string,
  patterns: ReadonlySet<string>, duplicate: boolean,
): ExtensionDecision {
  if (id === null) return refuse(id, "has invalid profile metadata.");
  if (id !== companionId) return refuse(id, "does not match the companion id.");
  if (duplicate) return refuse(id, "has a duplicate companion entry in this profile.");

  const path = folderPath(field(entry, "folderPath"));
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  if (!path || (path !== folder && !path.startsWith(prefix))) {
    return refuse(id, "must be inside the allowed companion folder.");
  }

  const name = field(entry, "manifestName");
  const hosts = strings(field(entry, "hostPermissions"));
  const permissions = strings(field(entry, "apiPermissions"));
  if (typeof name !== "string" || !name.trim() || !hosts || !permissions) {
    return refuse(id, "has invalid manifest metadata or permission lists.");
  }
  for (const pattern of hosts) {
    if (pattern === "<all_urls>") return refuse(id, "requests access to all sites.");
    if (pattern.startsWith("*://") || /:\/\/[^/]*\*/.test(pattern)) {
      return refuse(id, "requests a wildcard scheme or host.");
    }
    if (!patterns.has(pattern)) return refuse(id, "requests a host permission outside the chosen site patterns.");
  }
  if (permissions.some((permission) => !COMPANION_API_PERMISSIONS.includes(permission))) {
    return refuse(id, "requests an API permission outside the companion allowlist.");
  }
  return { id, decision: "allow", reason: `Extension ${id} matches the companion folder and permission rules.` };
}

/**
 * Check entries with id, folderPath, manifestName, hostPermissions and apiPermissions
 * against companionId, allowedFolder and sites. Folder checks compare path text.
 * The launcher supplies absolute paths with symlinks and junctions resolved.
 */
export function checkProfileExtensions(found: unknown, expected: unknown): ProfileExtensionResult {
  try {
    const entries = list(found);
    if (!entries) return hold("The profile extension list is invalid.");

    const ids = entries.map((entry) => extensionId(field(entry, "id")));
    const companionId = extensionId(field(expected, "companionId"));
    const folder = folderPath(field(expected, "allowedFolder"));
    const sites = strings(field(expected, "sites"));
    const chosen = sites && importSitePatterns(sites);
    if (!companionId || !folder || !chosen || chosen.rejected.length > 0) {
      return hold("The companion settings are invalid.", ids.map((id) => refuse(id, "cannot be checked with invalid companion settings.")));
    }

    const patterns = new Set(chosen.patterns);
    const duplicate = ids.indexOf(companionId) !== ids.lastIndexOf(companionId);
    const extensions = entries.map((entry, index) => checkExtension(entry, ids[index], companionId, folder, patterns, duplicate));
    return extensions.some(({ decision }) => decision === "refuse")
      ? hold("An extension failed the profile rules.", extensions)
      : { decision: "start", extensions };
  } catch {
    return hold("The profile extension data could not be checked.");
  }
}
