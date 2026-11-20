import type { ThreadRecord } from "./thread-meta.js";

export interface ThreadArchiveRecord extends ThreadRecord {
  archivedAt?: number;
}

export type ThreadArchiveRefusal =
  | { ok: false; reason: "invalid_record" | "invalid_records" | "invalid_time" | "invalid_lane_count" }
  | { ok: false; reason: "lanes_running"; record: ThreadArchiveRecord };

export type ThreadArchiveResult = { ok: true; record: ThreadArchiveRecord } | ThreadArchiveRefusal;

function isFiniteTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function copyThreadRecord(value: unknown): ThreadArchiveRecord | undefined {
  if (typeof value !== "object" || value === null) return;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return;

    const record = { ...value } as ThreadArchiveRecord;
    if (typeof record.sid !== "string" || !record.sid || record.sid.includes(":")
      || !Array.isArray(record.projectTags)
      || !isFiniteTime(record.lastActivityAt)
      || typeof record.openedBy !== "string"
      || (record.parentThreadId !== undefined && typeof record.parentThreadId !== "string")
      || (record.archivedAt !== undefined && !isFiniteTime(record.archivedAt))) return;

    for (const tag of record.projectTags) {
      if (typeof tag !== "string") return;
    }
    return record;
  } catch {
    return;
  }
}

/** Keep the first archive time and refuse to archive while a lane is running. */
export function archiveThread(record: unknown, now: unknown, runningLaneCount: unknown = 0): ThreadArchiveResult {
  const next = copyThreadRecord(record);
  if (!next) return { ok: false, reason: "invalid_record" };
  if (!isFiniteTime(now)) return { ok: false, reason: "invalid_time" };
  if (typeof runningLaneCount !== "number" || !Number.isSafeInteger(runningLaneCount) || runningLaneCount < 0) {
    return { ok: false, reason: "invalid_lane_count" };
  }
  if (runningLaneCount > 0) return { ok: false, reason: "lanes_running", record: next };

  next.archivedAt ??= now;
  return { ok: true, record: next };
}

export function unarchiveThread(record: unknown): ThreadArchiveResult {
  const next = copyThreadRecord(record);
  if (!next) return { ok: false, reason: "invalid_record" };
  delete next.archivedAt;
  return { ok: true, record: next };
}

/** Apply the archive rule for an activity whose timestamp is recorded by the caller. */
export function afterActivity(record: unknown, activityAt: unknown): ThreadArchiveResult {
  const next = copyThreadRecord(record);
  if (!next) return { ok: false, reason: "invalid_record" };
  if (!isFiniteTime(activityAt)) return { ok: false, reason: "invalid_time" };
  if (next.archivedAt !== undefined && activityAt > next.archivedAt) delete next.archivedAt;
  return { ok: true, record: next };
}

export function visibleInRail(records: unknown): ThreadArchiveRecord[] | ThreadArchiveRefusal {
  try {
    if (!Array.isArray(records)) return { ok: false, reason: "invalid_records" };

    const visible: ThreadArchiveRecord[] = [];
    for (const record of records) {
      const next = copyThreadRecord(record);
      if (!next) return { ok: false, reason: "invalid_record" };
      if (next.archivedAt === undefined) visible.push(next);
    }
    return visible;
  } catch {
    return { ok: false, reason: "invalid_records" };
  }
}
