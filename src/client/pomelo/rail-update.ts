export interface RailThread {
  sid: string;
  projectTags: readonly string[];
  lastActivityAt: number;
  openedBy: string;
  parentThreadId?: string;
}

export type RailEvent =
  | ({ type: "thread_opened" } & RailThread)
  | { type: "thread_activity"; sid: string; lastActivityAt: number }
  | { type: "thread_retagged"; sid: string; projectTags: readonly string[] }
  | { type: "thread_removed"; sid: string };

function hasTags(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  for (const tag of value) {
    if (typeof tag !== "string") return false;
  }
  return true;
}

function isRailEvent(value: unknown): value is RailEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (typeof event.sid !== "string" || !event.sid.trim()) return false;

  switch (event.type) {
    case "thread_opened":
      return Number.isFinite(event.lastActivityAt)
        && hasTags(event.projectTags)
        && typeof event.openedBy === "string"
        && (event.parentThreadId === undefined || typeof event.parentThreadId === "string");
    case "thread_activity":
      return Number.isFinite(event.lastActivityAt);
    case "thread_retagged":
      return hasTags(event.projectTags);
    case "thread_removed":
      return true;
    default:
      return false;
  }
}

export function applyRailEvent(
  rows: readonly RailThread[],
  event: unknown,
): { rows: readonly RailThread[]; needsRefetch: boolean } {
  if (!isRailEvent(event)) return { rows, needsRefetch: false };

  const index = rows.findIndex((row) => row.sid === event.sid);
  if (event.type === "thread_opened") {
    const { type, ...thread } = event;
    const opened = { ...thread, projectTags: [...thread.projectTags] };
    if (index === -1) return { rows: [...rows, opened], needsRefetch: false };

    // A replayed open can arrive after activity for the same session.
    const current = rows[index];
    const lastActivityAt = Math.max(current.lastActivityAt, opened.lastActivityAt);
    return { rows: rows.with(index, { ...current, ...opened, lastActivityAt }), needsRefetch: false };
  }

  if (index === -1) return { rows, needsRefetch: true };
  const thread = rows[index];
  switch (event.type) {
    case "thread_activity":
      if (event.lastActivityAt <= thread.lastActivityAt) return { rows, needsRefetch: false };
      return { rows: rows.with(index, { ...thread, lastActivityAt: event.lastActivityAt }), needsRefetch: false };
    case "thread_retagged": {
      const projectTags = [...new Set(event.projectTags)];
      return { rows: rows.with(index, { ...thread, projectTags }), needsRefetch: false };
    }
    case "thread_removed":
      return { rows: rows.toSpliced(index, 1), needsRefetch: false };
  }
}
