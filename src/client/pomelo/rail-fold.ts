// The underscores keep this group distinct from any project tag slug.
export const UNTAGGED = "__untagged__";

const MAX_FOLDED = 200;

export function isFolded(folded: readonly string[], slug: string): boolean {
  return folded.includes(slug);
}

export function toggleFold(folded: readonly string[], slug: string): string[] {
  const next = isFolded(folded, slug) ? folded.filter((entry) => entry !== slug) : [...folded, slug];
  return next.slice(-MAX_FOLDED);
}

export function cleanFolded(folded: unknown, liveSlugs: readonly string[]): string[] {
  if (!Array.isArray(folded)) return [];

  const live = new Set(liveSlugs);
  const cleaned = new Set<string>();
  for (const slug of folded) {
    if (typeof slug === "string" && live.has(slug)) {
      cleaned.add(slug);
      if (cleaned.size === MAX_FOLDED) break;
    }
  }
  return [...cleaned];
}

export function foldedSummary(
  threads: readonly { sid: string }[],
  unread: ReadonlySet<string>,
): { count: number; hasUnread: boolean } {
  return { count: threads.length, hasUnread: threads.some(({ sid }) => unread.has(sid)) };
}
