export interface FitTagChipsOptions {
  maxChips: number;
  /** Graphemes per label, including the ellipsis when shortened. */
  maxChars: number;
  activeTag?: string | null;
}

export interface TagChip {
  tag: string;
  label: string;
}

export interface TagChipOverflow {
  shown: TagChip[];
  hiddenCount: number;
  moreLabel: string;
  ariaLabel: string;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function chipLabel(tag: string, maxChars: number): string {
  if (tag.length <= maxChars) return tag;

  let count = 0;
  let cutAt = 0;
  for (const { index } of graphemes.segment(tag)) {
    if (count === maxChars) return `${tag.slice(0, cutAt)}…`;
    cutAt = index;
    count++;
  }
  return tag;
}

function emptyResult(): TagChipOverflow {
  return { shown: [], hiddenCount: 0, moreLabel: "", ariaLabel: "" };
}

/** Fit project chips to the row's limits while keeping the full names available to screen readers. */
export function fitTagChips(tags: unknown, opts: FitTagChipsOptions): TagChipOverflow {
  try {
    if (!Array.isArray(tags) || !opts || typeof opts !== "object") return emptyResult();
    const { maxChips, maxChars, activeTag } = opts;
    if (!Number.isInteger(maxChips) || maxChips < 0 || !Number.isInteger(maxChars) || maxChars < 1) {
      return emptyResult();
    }
    if (activeTag != null && typeof activeTag !== "string") return emptyResult();

    const byName = new Map<string, string>();
    for (const tag of tags) {
      if (typeof tag !== "string") return emptyResult();
      if (!tag.trim()) continue;
      const key = tag.toLowerCase();
      if (!byName.has(key)) byName.set(key, tag);
    }

    const activeKey = activeTag?.toLowerCase() ?? "";
    const active = byName.get(activeKey);
    byName.delete(activeKey);
    const names = [...byName.values()];
    if (active) names.unshift(active);

    const shown = names.slice(0, maxChips).map((tag) => ({ tag, label: chipLabel(tag, maxChars) }));
    const hiddenCount = names.length - shown.length;
    return {
      shown,
      hiddenCount,
      moreLabel: hiddenCount ? `+${hiddenCount}` : "",
      ariaLabel: names.join(", "),
    };
  } catch {
    // Malformed inputs can throw from getters or iteration.
    return emptyResult();
  }
}
