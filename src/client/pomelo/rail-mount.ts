import type { RecentSession } from "../storage.js";
import type { PomeloRailProps } from "./PomeloRail.js";
import type { ThreadMeta } from "./rail-order.js";

export { subscribeThreadMeta, threadMetaSnapshot } from "./thread-meta-store.js";

export function railMountProps(
  sessions: readonly RecentSession[],
  meta: Readonly<Record<string, ThreadMeta | undefined>>,
  activeSid: string | null,
  now: number,
  openSession: (session: RecentSession) => void,
  tagLabels?: PomeloRailProps["tagLabels"],
): PomeloRailProps | null {
  const hasTag = sessions.some(({ sid }) => Object.hasOwn(meta, sid) && meta[sid]?.projectTags?.length);
  if (!hasTag) return null;

  return {
    rows: sessions,
    currentThreadId: activeSid,
    now,
    tagLabels,
    onOpen(sid) {
      const session = sessions.find((row) => row.sid === sid);
      if (session) openSession(session);
    },
  };
}
