import { useState, useSyncExternalStore } from "react";
import { useUnread } from "../unread.js";
import { RailGroups, type RailGroupsProps } from "./RailGroups.js";
import { cleanFolded, toggleFold, UNTAGGED } from "./rail-fold.js";
import { railGroups } from "./rail-order.js";
import { subscribeThreadMeta, threadMetaSnapshot } from "./thread-meta-store.js";

export interface FoldStore {
  read(): string | null;
  write(text: string): void;
}

const foldKey = "pomelo:rail:folded";
const localFoldStore: FoldStore = {
  read: () => typeof window === "undefined" ? null : window.localStorage.getItem(foldKey),
  write: (text) => {
    if (typeof window !== "undefined") window.localStorage.setItem(foldKey, text);
  },
};

export function readFolded(foldStore: FoldStore, liveSlugs: readonly string[]): string[] {
  try {
    const text = foldStore.read();
    return text === null ? [] : cleanFolded(JSON.parse(text), liveSlugs);
  } catch {
    return [];
  }
}

export function writeFolded(foldStore: FoldStore, folded: readonly string[]): void {
  try {
    foldStore.write(JSON.stringify(folded));
  } catch {
    // Keep fold changes in memory when storage is unavailable.
  }
}

export interface PomeloRailProps extends Pick<RailGroupsProps,
  "rows" | "currentThreadId" | "onOpen" | "tagLabels" | "now"
> {
  foldStore?: FoldStore;
}

export function PomeloRail({ rows, currentThreadId, onOpen, tagLabels, now, foldStore = localFoldStore }: PomeloRailProps) {
  const meta = useSyncExternalStore(subscribeThreadMeta, threadMetaSnapshot, threadMetaSnapshot);
  const unread = useUnread();
  const [folded, setFolded] = useState(() => {
    const liveSlugs = railGroups(rows, meta).map(({ tag }) => tag ?? UNTAGGED);
    return readFolded(foldStore, liveSlugs);
  });

  function onToggleFold(slug: string): void {
    const next = toggleFold(folded, slug);
    writeFolded(foldStore, next);
    setFolded(next);
  }

  return (
    <RailGroups
      rows={rows}
      meta={meta}
      folded={folded}
      currentThreadId={currentThreadId}
      onOpen={onOpen}
      onToggleFold={onToggleFold}
      unread={unread}
      tagLabels={tagLabels}
      now={now}
    />
  );
}
