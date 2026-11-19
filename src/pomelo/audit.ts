import { HIDDEN, hideSecretsIn } from "../secrets.js";

export type AuditKind = "fill" | "import" | "grant" | "revoke" | "approval";

export interface AuditEvent {
  /** Unix time in milliseconds supplied by the caller. */
  at: number;
  kind: AuditKind;
  actor: string;
  outcome: "ok" | "refused" | "failed";
  threadId?: string;
  jobId?: string;
  refId?: string;
  grantId?: string;
  origin?: string;
  note?: string;
}

type AuditResult = { event: AuditEvent } | { error: string };

const idFields = ["threadId", "jobId", "refId", "grantId"] as const;
const textFields = ["actor", ...idFields, "origin", "note"] as const;
const allowedFields = new Set(["at", "kind", "outcome", ...textFields]);
const maxIdLength = 80;

/** Validate and copy the caller's audit metadata. */
export function auditEvent(input: unknown): AuditResult {
  if (input === null || typeof input !== "object") return { error: "Expected an audit event object" };
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return { error: "Expected a plain audit event object" };

  const fields: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !allowedFields.has(key)) return { error: "Unexpected audit field" };
    const property = Object.getOwnPropertyDescriptor(input, key);
    if (!property || !("value" in property)) return { error: "Expected audit fields to be data properties" };
    fields[key] = property.value;
  }

  const { at, kind, actor, outcome, origin, note } = fields;
  if (typeof at !== "number" || !Number.isFinite(at)) return { error: "Invalid audit timestamp" };
  if (kind !== "fill" && kind !== "import" && kind !== "grant" && kind !== "revoke" && kind !== "approval") {
    return { error: "Unknown audit kind" };
  }
  if (outcome !== "ok" && outcome !== "refused" && outcome !== "failed") return { error: "Unknown audit outcome" };
  if (typeof actor !== "string" || !actor.trim() || actor.length > maxIdLength) return { error: "Invalid audit actor" };

  const event: AuditEvent = { at, kind, actor, outcome };
  for (const field of idFields) {
    const id = fields[field];
    if (id === undefined) continue;
    if (typeof id !== "string" || !id.trim() || id.length > maxIdLength) return { error: `Invalid audit ${field}` };
    event[field] = id;
  }
  if (origin !== undefined) {
    if (typeof origin !== "string") return { error: "Invalid audit origin" };
    try {
      if (new URL(origin).origin !== origin) return { error: "Invalid audit origin" };
    } catch {
      return { error: "Invalid audit origin" };
    }
    event.origin = origin;
  }
  if (note !== undefined) {
    if (typeof note !== "string" || note.length > 200) return { error: "Invalid audit note" };
    event.note = note;
  }
  return { event };
}

/** Append one event after checking caller-supplied metadata for recognized secret formats. */
export async function recordAudit(
  sink: { appendLog(key: string, entry: unknown): Promise<void> },
  input: unknown,
): Promise<AuditResult> {
  const result = auditEvent(input);
  if ("error" in result) return result;

  const { event } = result;
  const entry = hideSecretsIn(event);
  // The shield can preserve part of the string around a match. Drop the entire field in audit entries.
  for (const field of textFields) {
    if (entry[field] !== event[field]) entry[field] = HIDDEN;
  }
  await sink.appendLog("audit", entry);
  return { event: { ...entry } };
}
