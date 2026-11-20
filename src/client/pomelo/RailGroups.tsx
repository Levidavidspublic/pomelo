import { ChevronRightIcon } from "lucide-react";
import type { RecentSession } from "../storage.js";
import { isFolded, UNTAGGED } from "./rail-fold.js";
import { railGroups, type ThreadMeta } from "./rail-order.js";
import { railRow } from "./rail-row.js";
import { tagColour } from "./tag-colour.js";

export interface RailGroupsProps {
  rows: readonly RecentSession[];
  meta: Readonly<Record<string, ThreadMeta | undefined>>;
  folded: readonly string[];
  currentThreadId: string | null;
  onOpen: (sid: string) => void;
  onToggleFold: (slug: string) => void;
  unread?: ReadonlySet<string>;
  tagLabels?: Readonly<Record<string, string | undefined>>;
  now?: number;
}

const noUnread: ReadonlySet<string> = new Set();

export function RailGroups({
  rows, meta, folded, currentThreadId, onOpen, onToggleFold,
  unread = noUnread, tagLabels, now = Date.now(),
}: RailGroupsProps) {
  return railGroups(rows, meta, tagLabels).map((group) => {
    const slug = group.tag ?? UNTAGGED;
    const expanded = !isFolded(folded, slug);
    const { bg, fg } = tagColour(slug);

    return (
      <section key={slug} className="sb-tray">
        <h2>
          <button
            type="button"
            className="sb-group-label flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-expanded={expanded}
            onClick={() => onToggleFold(slug)}
          >
            <span dir="auto" className="min-w-0 truncate rounded px-1.5" style={{ backgroundColor: bg, color: fg }}>
              {group.label}
            </span>
            <ChevronRightIcon aria-hidden="true" className={`sb-fold-chev size-3 shrink-0${expanded ? " rotate-90" : ""}`} />
          </button>
        </h2>
        {expanded && group.rows.map((thread) => {
          const row = railRow(thread, unread, now);
          const current = row.sid === currentThreadId;

          return (
            <button
              key={row.sid}
              type="button"
              className="dass-row sb-row"
              data-sid={row.sid}
              data-active={current || undefined}
              data-unread={row.unread || undefined}
              aria-current={current ? "page" : undefined}
              onClick={() => onOpen(row.sid)}
            >
              <span className="flex min-w-0 items-center gap-2">
                {row.unread && <span className="sb-unread-dot" aria-hidden="true" />}
                <span className="dass-row-title" dir="auto">{row.title}</span>
                {row.unread && <span className="sr-only">Unread</span>}
                {thread.runningSubagents > 0 && (
                  <span className="shrink-0 rounded-full bg-sidebar-accent px-1.5 text-xs text-sidebar-accent-foreground">
                    <span className="sr-only">Running sub-agents: </span>{thread.runningSubagents}
                  </span>
                )}
                <span className="shrink-0 text-xs text-[var(--text-muted)]">{row.timeLabel}</span>
              </span>
            </button>
          );
        })}
      </section>
    );
  });
}
