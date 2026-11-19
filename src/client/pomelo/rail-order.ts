import type { RecentSession } from "../storage.js";

export interface ThreadMeta {
  lastActivityAt?: number;
  projectTags?: readonly string[];
  runningSubagents?: number;
}

export interface RailRow extends RecentSession {
  lastActivityAt: number;
  runningSubagents: number;
}

export interface RailGroup {
  tag: string | null;
  label: string;
  rows: RailRow[];
}

export function railGroups(
  rows: readonly RecentSession[],
  meta: Readonly<Record<string, ThreadMeta | undefined>>,
  tagLabels: Readonly<Record<string, string | undefined>> = {},
): RailGroup[] {
  const threads = rows.map((session) => {
    const thread = Object.hasOwn(meta, session.sid) ? meta[session.sid] : undefined;
    const row: RailRow = {
      ...session,
      lastActivityAt: thread?.lastActivityAt ?? session.openedAt,
      runningSubagents: thread?.runningSubagents ?? 0,
    };
    return { row, tags: new Set(thread?.projectTags) };
  });
  threads.sort((a, b) => b.row.lastActivityAt - a.row.lastActivityAt);

  // In activity order, the first thread for each tag determines its group's position.
  const tagged = new Map<string, RailGroup>();
  const untagged: RailGroup = { tag: null, label: "Untagged", rows: [] };
  for (const { row, tags } of threads) {
    if (tags.size === 0) untagged.rows.push(row);
    for (const tag of tags) {
      let group = tagged.get(tag);
      if (!group) {
        const label = Object.hasOwn(tagLabels, tag) ? tagLabels[tag] : undefined;
        group = { tag, label: label ?? tag, rows: [] };
        tagged.set(tag, group);
      }
      group.rows.push(row);
    }
  }

  const groups = [...tagged.values()];
  if (untagged.rows.length) groups.push(untagged);
  // The stable sort keeps activity order within pinned and unpinned rows.
  for (const group of groups) {
    group.rows.sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)));
  }
  return groups;
}
