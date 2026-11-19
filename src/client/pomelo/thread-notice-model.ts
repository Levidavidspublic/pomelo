import { MAIN_LANE } from "../../types.js";

export interface ThreadNotice {
  threadId: string;
  parentThreadId: string;
  title: string;
  openedBy: string;
  projectTags: readonly string[];
  at: number;
  action: "open-thread";
}

export interface ThreadNoticeState {
  notices: readonly ThreadNotice[];
  /** Retained after dismissal so replayed events stay dismissed. */
  seen: readonly string[];
}

const TITLE_LIMIT = 80;
const titleSegments = new Intl.Segmenter();

function noticeTitle(value: unknown): string {
  if (typeof value !== "string") return "New thread";
  const title = value.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "").trim();
  let count = 0;
  let end = 0;
  for (const { index } of titleSegments.segment(title)) {
    if (count === TITLE_LIMIT) return title.slice(0, end) + "…";
    end = index;
    count++;
  }
  return title || "New thread";
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readNotice(event: unknown): ThreadNotice | undefined {
  if (!event || typeof event !== "object") return;
  try {
    const { type, sid, parentThreadId, openedBy, laneId, title, projectTags, lastActivityAt } =
      event as Record<string, unknown>;
    if (type !== "thread_opened" || (laneId !== undefined && laneId !== MAIN_LANE)) return;
    if (!isId(sid) || !isId(parentThreadId) || sid === parentThreadId) return;
    if (!isId(openedBy) || openedBy === "user" || openedBy === "amit") return;
    if (typeof lastActivityAt !== "number" || !Number.isFinite(lastActivityAt)) return;

    const tags: string[] = [];
    if (Array.isArray(projectTags)) {
      for (let index = 0; index < projectTags.length; index++) {
        const tag: unknown = projectTags[index];
        if (typeof tag === "string") tags.push(tag);
      }
    }

    return {
      threadId: sid,
      parentThreadId,
      title: noticeTitle(title),
      openedBy,
      projectTags: tags,
      at: lastActivityAt,
      action: "open-thread",
    };
  } catch {
    // An untrusted object's properties can throw when read.
    return;
  }
}

export function addThreadNotice(state: ThreadNoticeState, event: unknown): ThreadNoticeState {
  const notice = readNotice(event);
  if (!notice || state.seen.includes(notice.threadId)) return state;
  return { notices: [...state.notices, notice], seen: [...state.seen, notice.threadId] };
}

export function dismissThreadNotice(state: ThreadNoticeState, threadId: unknown): ThreadNoticeState {
  if (!isId(threadId)) return state;
  const notices = state.notices.filter((notice) => notice.threadId !== threadId);
  if (notices.length === state.notices.length) return state;
  return { notices, seen: state.seen };
}

export function noticesFor(state: ThreadNoticeState, parentThreadId: unknown): ThreadNotice[] {
  if (!isId(parentThreadId)) return [];
  return state.notices.filter((notice) => notice.parentThreadId === parentThreadId);
}
