import type { RailGroup } from "./rail-order.js";

export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function filterRail(
  groups: readonly RailGroup[],
  { text, tags }: { text: string; tags: readonly string[] },
): { groups: readonly RailGroup[]; shown: number; total: number; emptyNote: string | null } {
  const query = foldText(text);
  const total = groups.reduce((count, group) => count + group.rows.length, 0);
  if (!query && tags.length === 0) {
    return { groups, shown: total, total, emptyNote: total === 0 ? "No threads yet." : null };
  }

  const pickedTags = new Set(tags);
  const filtered: RailGroup[] = [];
  let shown = 0;
  for (const group of groups) {
    if (pickedTags.size > 0 && (group.tag === null || !pickedTags.has(group.tag))) continue;

    const allRowsMatch = !query || (group.tag !== null &&
      (foldText(group.label).includes(query) || foldText(group.tag).includes(query)));
    const rows = allRowsMatch ? group.rows.slice() : group.rows.filter((row) => foldText(row.title).includes(query));
    if (rows.length === 0) continue;

    filtered.push({ ...group, rows });
    shown += rows.length;
  }

  return { groups: filtered, shown, total, emptyNote: shown === 0 ? "No threads match your filters." : null };
}
