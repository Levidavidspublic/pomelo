import { parseSavedPanel, type SidePanel } from "./side-panel.js";

export interface ThreadLinkTarget {
  threadId: string;
  panel?: SidePanel;
  artifactId?: string;
  version?: number;
  jobId?: string;
}

export type ThreadLinkResult = { ok: true; target: ThreadLinkTarget } | { ok: false; reason: string };

const PREFIX = "#thread?";
const MAX_LINK_LENGTH = 2048;
const MAX_ID_LENGTH = 128;
const TARGET_KEYS = ["threadId", "panel", "artifactId", "version", "jobId"] as const;

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && !/[^A-Za-z0-9_-]/.test(value);
}

function validateTarget(fields: Partial<Omit<ThreadLinkTarget, "panel">> & { panel?: string }): ThreadLinkResult {
  const { threadId, panel: panelName, artifactId, version, jobId } = fields;
  if (!validId(threadId)) return { ok: false, reason: "Missing or invalid thread id." };
  if (artifactId !== undefined && !validId(artifactId)) return { ok: false, reason: "Invalid artifact id." };
  if (jobId !== undefined && !validId(jobId)) return { ok: false, reason: "Invalid job id." };

  const panel = parseSavedPanel(panelName ?? null);
  if (panelName !== undefined && panel === null) return { ok: false, reason: "Unknown side panel." };
  if (version !== undefined) {
    if (!Number.isSafeInteger(version) || version < 1) return { ok: false, reason: "Invalid artifact version." };
    if (artifactId === undefined) return { ok: false, reason: "An artifact version requires an artifact id." };
  }

  const target: ThreadLinkTarget = { threadId };
  if (panel !== null) target.panel = panel;
  if (artifactId !== undefined) target.artifactId = artifactId;
  if (version !== undefined) target.version = version;
  if (jobId !== undefined) target.jobId = jobId;
  return { ok: true, target };
}

/** Make a hash address for a thread target. Throws when the target has invalid fields. */
export function makeThreadLink(input: ThreadLinkTarget): string {
  const result = validateTarget(input);
  if (!result.ok) throw new TypeError(result.reason);

  const params = new URLSearchParams();
  for (const key of TARGET_KEYS) {
    const value = result.target[key];
    if (value !== undefined) params.set(key, String(value));
  }
  return PREFIX + params.toString();
}

/** Read a thread hash address into data. Only the known parameters enter the target. */
export function readThreadLink(text: string): ThreadLinkResult {
  if (text.length > MAX_LINK_LENGTH) return { ok: false, reason: "Thread link is too long." };
  if (!text.startsWith(PREFIX)) return { ok: false, reason: "Expected a thread link." };

  const params = new URLSearchParams(text.slice(PREFIX.length));
  if (TARGET_KEYS.some((key) => params.getAll(key).length > 1)) {
    return { ok: false, reason: "A thread link parameter is repeated." };
  }

  const version = params.get("version");
  if (version !== null && !/^[0-9]+$/.test(version)) return { ok: false, reason: "Invalid artifact version." };
  return validateTarget({
    threadId: params.get("threadId") ?? undefined,
    panel: params.get("panel") ?? undefined,
    artifactId: params.get("artifactId") ?? undefined,
    version: version === null ? undefined : Number(version),
    jobId: params.get("jobId") ?? undefined,
  });
}
