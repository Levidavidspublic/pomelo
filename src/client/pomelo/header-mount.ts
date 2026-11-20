import type { RecentSession } from "../storage.js";
import type { PomeloTagChipsProps } from "./PomeloTagChips.js";
import type { threadMetaSnapshot } from "./thread-meta-store.js";
import { threadOrigin, type ThreadOriginResult } from "./thread-origin.js";

type HeaderMountProps = {
  chips: PomeloTagChipsProps | null;
  origin: {
    origin: ThreadOriginResult;
    onOpenParent: (sid: string) => void;
  } | null;
};

export function headerMountProps(
  sid: string,
  meta: ReturnType<typeof threadMetaSnapshot>,
  sessions: readonly RecentSession[],
  openSession: (session: RecentSession) => void,
  tagLabels?: PomeloTagChipsProps["labels"],
): HeaderMountProps | null {
  const thread = Object.hasOwn(meta, sid) ? meta[sid] : undefined;
  if (!thread) return null;

  const { projectTags, parentThreadId } = thread;
  const chips = projectTags?.length ? { tags: projectTags, labels: tagLabels, maxChips: 3 } : null;
  const openedBy = thread.openedBy?.trim();
  if (!openedBy || openedBy === "amit" || openedBy === "user") {
    return chips ? { chips, origin: null } : null;
  }

  const threadsById = new Map(sessions.map(({ sid, title }) => [sid, {
    sid,
    title,
    parentThreadId: Object.hasOwn(meta, sid) ? meta[sid]?.parentThreadId : undefined,
  }]));
  const origin = threadOrigin({ sid, title: threadsById.get(sid)?.title ?? "", openedBy, parentThreadId }, threadsById);

  return {
    chips,
    origin: {
      origin,
      onOpenParent(parentSid) {
        if (parentSid !== origin.parent?.sid) return;
        const parent = sessions.find((row) => row.sid === parentSid);
        if (parent) openSession(parent);
      },
    },
  };
}
