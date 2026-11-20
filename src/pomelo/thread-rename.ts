import { cleanThreadTitle } from "./thread-title.js";

export type ThreadTitleAuthor = "agent" | "amit";

export interface ThreadTitleState {
  title: string;
  titleBy?: ThreadTitleAuthor;
}

export interface RenameThreadRequest {
  title: string;
  by: ThreadTitleAuthor;
}

export interface RenameThreadResult {
  ok: boolean;
  changed: boolean;
  title: string;
  titleBy: ThreadTitleAuthor | undefined;
  reason?: string;
}

export function renameThread(current: ThreadTitleState, request: RenameThreadRequest): RenameThreadResult {
  const unchanged = { changed: false, title: current.title, titleBy: current.titleBy };
  if (current.titleBy === "amit" && request.by === "agent") {
    return { ok: false, ...unchanged, reason: "Amit named this thread." };
  }

  // Strip directional marks as well as overrides, while keeping Hebrew vowel marks and emoji joiners.
  const { title, reasons } = cleanThreadTitle(request.title.replace(/\p{Bidi_Control}/gu, ""));
  if (reasons.includes("empty")) {
    return { ok: false, ...unchanged, reason: "Enter a thread title." };
  }
  if (title === current.title) return { ok: true, ...unchanged };

  return { ok: true, changed: true, title, titleBy: request.by };
}
