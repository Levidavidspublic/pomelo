import type { RecentSession } from "../storage.js";

interface ThreadMeta {
  lastActivityAt?: number;
  projectTags?: readonly string[];
}

type HomeMeta = Readonly<Record<string, ThreadMeta | undefined>>;

export interface ProjectChip {
  slug: string;
  label: string;
  count: number;
  lastActivityAt: number;
}

function byActivity(rows: readonly RecentSession[], meta: HomeMeta) {
  return rows.map((row) => {
    const thread = Object.hasOwn(meta, row.sid) ? meta[row.sid] : undefined;
    return {
      row,
      lastActivityAt: thread?.lastActivityAt ?? row.openedAt,
      projectTags: thread?.projectTags,
    };
  }).sort((a, b) => {
    const activityOrder = b.lastActivityAt - a.lastActivityAt;
    if (activityOrder) return activityOrder;
    if (a.row.sid === b.row.sid) return 0;
    return a.row.sid < b.row.sid ? -1 : 1;
  });
}

export function homeRecents(rows: readonly RecentSession[], meta: HomeMeta, limit = 5): RecentSession[] {
  return byActivity(rows, meta).slice(0, Math.max(0, limit)).map(({ row }) => row);
}

export function projectChips(
  rows: readonly RecentSession[],
  meta: HomeMeta,
  tagLabels: Readonly<Record<string, string | undefined>>,
): ProjectChip[] {
  // The first thread seen for a tag gives the chip its activity time and position.
  const chips = new Map<string, ProjectChip>();
  for (const { lastActivityAt, projectTags } of byActivity(rows, meta)) {
    if (!Array.isArray(projectTags)) continue;
    for (const slug of new Set(projectTags)) {
      if (typeof slug !== "string" || !slug.trim()) continue;
      const chip = chips.get(slug);
      if (chip) {
        chip.count += 1;
      } else {
        const label = Object.hasOwn(tagLabels, slug) ? tagLabels[slug] : undefined;
        chips.set(slug, { slug, label: label ?? slug, count: 1, lastActivityAt });
      }
    }
  }
  return [...chips.values()];
}
