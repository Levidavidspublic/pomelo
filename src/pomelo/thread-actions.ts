import { runningCount } from "./lanes.js";
import type { PomeloStore } from "./store.js";
import { archiveThread, unarchiveThread, type ThreadArchiveRecord, type ThreadArchiveRefusal } from "./thread-archive.js";
import { getThreadMeta, saveThreadMeta } from "./thread-meta.js";
import { renameThread, type RenameThreadRequest, type ThreadTitleState } from "./thread-rename.js";
import { retagThread } from "./thread-retag.js";

export type ThreadActionRequest = { sid: string } & (
  | { action: "retag"; labels: readonly string[]; by: string }
  | ({ action: "rename" } & RenameThreadRequest)
  | { action: "archive" | "unarchive" }
);

type ThreadActionRefusal = { ok: false; code: string; reason: string };

export type ThreadActionReply =
  | { ok: true; action: "retag"; thread: { sid: string; projectTags: string[] } }
  | { ok: true; action: "rename"; thread: { sid: string } & ThreadTitleState }
  | { ok: true; action: "archive" | "unarchive"; thread: { sid: string; archivedAt: number | null } }
  | ThreadActionRefusal;

const archiveReasons: Record<ThreadArchiveRefusal["reason"], string> = {
  invalid_record: "The thread record is invalid.",
  invalid_records: "The thread records are invalid.",
  invalid_time: "The archive time is invalid.",
  invalid_lane_count: "Could not check for running sub-agents.",
  lanes_running: "Wait for the running sub-agents to finish before putting away this thread.",
};

const pendingActions = new Map<string, Promise<ThreadActionReply>>();

function refuse(code: string, reason: string): ThreadActionRefusal {
  return { ok: false, code, reason };
}

function parseRequest(body: unknown): ThreadActionRequest | ThreadActionRefusal {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return refuse("invalid_body", "Provide a thread action object.");
  }

  const { action, sid, labels, title, by } = body as Record<string, unknown>;
  if (action !== "retag" && action !== "rename" && action !== "archive" && action !== "unarchive") {
    return refuse("unknown_action", "Choose a supported thread action.");
  }
  if (sid === undefined || sid === null || (typeof sid === "string" && !sid.trim())) {
    return refuse("missing_sid", "Provide a thread ID.");
  }
  if (typeof sid !== "string" || !/^[\w-]+$/.test(sid)) {
    return refuse("invalid_sid", "Provide a valid thread ID.");
  }

  if (action === "retag") {
    const entries: unknown[] = Array.isArray(labels) ? [...labels] : [];
    if (!Array.isArray(labels) || !entries.every((label) => typeof label === "string")
      || typeof by !== "string" || !by.trim()) {
      return refuse("invalid_retag", "Provide tag labels as text and say who is retagging the thread.");
    }
    return { action, sid, labels: entries, by };
  }
  if (action === "rename") {
    if (typeof title !== "string" || (by !== "amit" && by !== "agent")) {
      return refuse("invalid_rename", "Provide a title and say whether Amit or an agent is renaming the thread.");
    }
    return { action, sid, title, by };
  }
  return { action, sid };
}

async function applyAction(store: PomeloStore, request: ThreadActionRequest, now: number): Promise<ThreadActionReply> {
  const { action, sid } = request;
  const record: (ThreadArchiveRecord & Partial<ThreadTitleState>) | null = await getThreadMeta(store, sid);
  if (!record) return refuse("thread_not_found", "Thread not found.");

  if (action === "retag") {
    const result = await retagThread(store, request);
    if (!result.ok) return refuse("retag_refused", result.error);
    return { ok: true, action, thread: { sid, projectTags: result.tags } };
  }

  if (action === "rename") {
    const result = renameThread({ title: record.title ?? "", titleBy: record.titleBy }, request);
    if (!result.ok) return refuse("rename_refused", result.reason ?? "Could not rename the thread.");
    const { title, titleBy } = result;
    if (result.changed) {
      const updated = { ...record, title, titleBy };
      await saveThreadMeta(store, updated);
    }
    return { ok: true, action, thread: { sid, title, titleBy } };
  }

  const result = action === "archive"
    ? archiveThread(record, now, await runningCount(store, sid))
    : unarchiveThread(record);
  if (!result.ok) return refuse(result.reason, archiveReasons[result.reason]);
  const { archivedAt } = result.record;
  if (archivedAt !== record.archivedAt) await saveThreadMeta(store, result.record);
  return { ok: true, action, thread: { sid, archivedAt: archivedAt ?? null } };
}

/** The caller is responsible for session authorization and supplies the trusted actor. */
export async function runThreadAction(store: PomeloStore, request: unknown, now: number): Promise<ThreadActionReply> {
  const parsed = parseRequest(request);
  if ("ok" in parsed) return parsed;

  // Serialize actions for a thread even when callers use different store wrappers.
  const { sid } = parsed;
  const previous = pendingActions.get(sid) ?? Promise.resolve();
  const apply = () => applyAction(store, parsed, now);
  const pending = previous.then(apply, apply);
  pendingActions.set(sid, pending);
  try {
    return await pending;
  } catch {
    return refuse("store_error", "Could not update the thread.");
  } finally {
    if (pendingActions.get(sid) === pending) pendingActions.delete(sid);
  }
}
