export interface TagSuggestionThread {
  id: string;
  projectTags?: readonly string[];
}

export interface TagProposal {
  threadId: string;
  slug: string;
  label: string;
  proposedBy: string;
  at: number;
}

export type DismissedSuggestions = Readonly<Record<string, readonly string[] | undefined>>;

export function suggestionChips(
  thread: TagSuggestionThread,
  proposals: readonly Readonly<TagProposal>[],
  dismissed: readonly string[] = [],
): TagProposal[] {
  const hidden = new Set([...(thread.projectTags ?? []), ...dismissed]);
  const newestBySlug = new Map<string, Readonly<TagProposal>>();

  for (const proposal of proposals) {
    const { threadId, slug, at } = proposal;
    if (threadId !== thread.id || !/^[a-z0-9-]+$/.test(slug) || hidden.has(slug)) continue;

    const previous = newestBySlug.get(slug);
    if (!previous || at > previous.at) newestBySlug.set(slug, proposal);
  }

  return [...newestBySlug.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
    .map((proposal) => ({ ...proposal, label: Array.from(proposal.label.trim()).slice(0, 40).join("") }));
}

export function acceptSuggestion(thread: TagSuggestionThread, slug: string): string[] {
  return [...new Set([...(thread.projectTags ?? []), slug])];
}

export function dismissSuggestion(dismissed: DismissedSuggestions, threadId: string, slug: string): DismissedSuggestions {
  const slugs = Object.hasOwn(dismissed, threadId) ? dismissed[threadId] : undefined;
  return { ...dismissed, [threadId]: [...new Set([...(slugs ?? []), slug])] };
}
