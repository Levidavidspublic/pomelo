import { useId, type CSSProperties } from "react";
import type { RecentSession } from "../storage.js";
import { homeRecents } from "./home-chips.js";
import { PomeloTagChips, type PomeloTagChipsProps } from "./PomeloTagChips.js";
import { timeLabel } from "./rail-row.js";
import { textDirection } from "./text-direction.js";
import { POMELO_TOKENS } from "./theme-tokens.js";

type HomeThreadMeta = NonNullable<Parameters<typeof homeRecents>[1][string]> & { openedBy?: string };

export interface PomeloHomeRecentsProps {
  rows: readonly RecentSession[];
  meta: Readonly<Record<string, HomeThreadMeta | undefined>>;
  now: number;
  onOpen: (sid: string) => void;
  tagLabels?: PomeloTagChipsProps["labels"];
  limit?: number;
}

const { light, dark } = POMELO_TOKENS;
const theme = {
  "--recent-surface": `light-dark(${light.surface}, ${dark.surface})`,
  "--recent-text": `light-dark(${light.text}, ${dark.text})`,
  "--recent-muted": `light-dark(${light.textSecondary}, ${dark.textSecondary})`,
  "--recent-border": `light-dark(${light.divider}, ${dark.divider})`,
  "--recent-accent": `light-dark(${light.accent}, ${dark.accent})`,
} as CSSProperties;

export function PomeloHomeRecents({ rows, meta, now, onOpen, tagLabels, limit }: PomeloHomeRecentsProps) {
  const id = useId();
  const recents = homeRecents(rows, meta, limit);
  if (recents.length === 0) {
    return <p dir="ltr" className="text-start text-sm text-[color:var(--recent-muted)]" style={theme}>No threads yet</p>;
  }

  return (
    <ul role="list" aria-label="Recent threads" className="flex list-none flex-col gap-2" style={theme}>
      {recents.map(({ sid, title, openedAt }, index) => {
        const thread = Object.hasOwn(meta, sid) ? meta[sid] : undefined;
        const label = title.trim() || "Untitled";
        const activity = timeLabel(thread?.lastActivityAt ?? openedAt, now);
        const opener = thread?.openedBy?.trim();
        const agentOpened = opener && opener !== "person" && opener !== "user" && opener !== "amit";
        const tags = thread?.projectTags;
        const titleId = `${id}-${index}-title`;
        const activityId = `${id}-${index}-activity`;
        const openerId = `${id}-${index}-opener`;
        const tagsId = `${id}-${index}-tags`;
        const details = [activity && activityId, agentOpened && openerId, tags?.length && tagsId].filter(Boolean).join(" ");

        return (
          <li
            key={sid}
            className="relative rounded-xl border border-[color:var(--recent-border)] bg-[var(--recent-surface)] p-3 text-[color:var(--recent-text)] hover:border-[color:var(--recent-accent)]"
          >
            {/* Stretch the button over the row so the chip list can keep its list markup. */}
            <button
              type="button"
              aria-labelledby={titleId}
              aria-describedby={details || undefined}
              className="block w-full cursor-pointer text-start text-sm focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[color:var(--recent-accent)]"
              onClick={() => onOpen(sid)}
            >
              <span className="flex items-baseline justify-between gap-2">
                <bdi id={titleId} dir={textDirection(label)} className="min-w-0 font-medium [overflow-wrap:anywhere]">{label}</bdi>
                {activity && <bdi id={activityId} dir="ltr" className="shrink-0 text-xs text-[color:var(--recent-muted)]">{activity}</bdi>}
              </span>
              {agentOpened && <bdi id={openerId} dir="ltr" className="block text-xs text-[color:var(--recent-muted)]">opened by an agent</bdi>}
            </button>
            {!!tags?.length && (
              <div id={tagsId} className="mt-2">
                <PomeloTagChips tags={tags} labels={tagLabels} maxChips={3} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
