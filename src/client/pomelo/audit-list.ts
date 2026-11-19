import type { AuditEvent, AuditKind } from "../../pomelo/audit.js";
import { hideSecrets } from "../../secrets.js";

type AuditRow = {
  kind: AuditKind | null;
  label: string;
  at: number | null;
  site?: string;
  refLabel?: string;
  jobId?: string;
};

type AuditFilter = {
  kind?: AuditKind;
  site?: string;
  pageSize?: number;
};

type AuditList = {
  rows: AuditRow[];
  more: boolean;
  empty: string | null;
};

const labels = {
  fill: { ok: "Filled a saved login", refused: "Login fill refused", failed: "Login fill failed" },
  import: { ok: "Imported cookies from Chrome", refused: "Chrome cookie import refused", failed: "Chrome cookie import failed" },
  grant: { ok: "Allowed fills on this site", refused: "Fill permission refused", failed: "Granting fill permission failed" },
  revoke: { ok: "Fill permission revoked", refused: "Revoking fill permission refused", failed: "Revoking fill permission failed" },
  approval: { ok: "Request approved", refused: "Request denied", failed: "Request failed" },
} satisfies Record<AuditKind, Record<AuditEvent["outcome"], string>>;

// Match the vault settings path shape and only use its vault and item as display metadata.
const referencePath = /^op:\/\/([^/:@\s\\?#\p{Cc}]+)\/([^/\s\\?#\p{Cc}]+)(?:\/[^/\s\\?#\p{Cc}]+){1,2}$/iu;
const labelText = /^[\p{L}\p{M}\p{N} ._'’()-]+$/u;
const jobIdText = /^[a-z0-9_-]{1,80}$/i;
const hostText = /^[a-z0-9.-]+$|^\[[a-f0-9:]+\]$/i;

function isAuditKind(value: unknown): value is AuditKind {
  return typeof value === "string" && Object.hasOwn(labels, value);
}

function looksLikeValue(text: string): boolean {
  if (hideSecrets(text).hidden > 0) return true;
  // Opaque IDs and encodings can fit the same character set as display metadata.
  return (text.match(/[a-z0-9_-]{12,}/gi) ?? []).some((word) => {
    if (word.length >= 16 && (/^[a-f0-9]+$/i.test(word) || /\d/.test(word))) return true;
    try {
      const base64 = word.replaceAll("-", "+").replaceAll("_", "/");
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return /^[^\p{C}]+$/u.test(decoded);
    } catch {
      return false;
    }
  });
}

function referenceLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 80) return;
  const path = referencePath.exec(value);
  try {
    const parts = path ? [decodeURIComponent(path[1]), decodeURIComponent(path[2])] : [value];
    if (parts.every((part) => part.trim() && labelText.test(part) && !looksLikeValue(part))) {
      return parts.join(" / ");
    }
  } catch {
    // A malformed escape leaves the reference label unavailable.
  }
}

function siteOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 270 || !URL.canParse(value)) return;
  const url = new URL(value);
  if ((url.protocol === "https:" || url.protocol === "http:") && url.origin === value &&
    hostText.test(url.hostname) && !looksLikeValue(value)) return value;
}

function rowLabel(kind: AuditKind, outcome: AuditEvent["outcome"], note: unknown): string {
  if (kind === "approval" && typeof note === "string") {
    // Older records can describe the approval state in a note. Match only fixed wording.
    const status = /^(?:(?:approval|request) )?(expired|denied)$/i.exec(note.trim())?.[1]?.toLowerCase();
    if (status === "expired") return "Request expired";
    if (status === "denied") return "Request denied";
  }
  return labels[kind][outcome];
}

function auditRow(event: unknown): AuditRow {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    return { kind: null, at: null, label: "Unreadable entry" };
  }

  const field = (name: keyof AuditEvent): unknown => Object.getOwnPropertyDescriptor(event, name)?.value;
  const time = field("at");
  const at = typeof time === "number" && Number.isFinite(new Date(time).getTime()) ? time : null;
  const kind = field("kind");
  const outcome = field("outcome");
  if (at === null || !isAuditKind(kind) || (outcome !== "ok" && outcome !== "refused" && outcome !== "failed")) {
    return { kind: null, at, label: "Unreadable entry" };
  }

  const jobId = field("jobId");
  return {
    kind,
    at,
    label: rowLabel(kind, outcome, field("note")),
    site: siteOrigin(field("origin")),
    refLabel: referenceLabel(field("refId")),
    jobId: typeof jobId === "string" && jobIdText.test(jobId) && !looksLikeValue(jobId) ? jobId : undefined,
  };
}

export function auditList(events: readonly unknown[], filter: AuditFilter = {}): AuditList {
  const { kind, site, pageSize } = filter;
  const limit = pageSize !== undefined && Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 50;
  const rows = events.map(auditRow).filter((row) =>
    (kind === undefined || row.kind === kind) && (site === undefined || row.site === site),
  );
  // Array.sort is stable, so equal timestamps retain the order they came in.
  rows.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity));
  return {
    rows: rows.slice(0, limit),
    more: rows.length > limit,
    empty: rows.length ? null : kind === undefined && site === undefined
      ? "No audit entries yet."
      : "No audit entries match these filters.",
  };
}
