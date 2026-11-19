type ThreadOpenFields = {
  projectTags: string[];
  lastActivityAt: number;
  openedBy: string;
  parentThreadId?: string;
};

export function newThreadFields(input: {
  parent?: { id: string; projectTags?: string[] };
  openedBy: string;
  tags?: string[];
  now: number;
}): ThreadOpenFields | { error: string } {
  const { parent, openedBy, tags, now } = input;
  if (!openedBy.trim()) return { error: "openedBy is required" };

  const projectTags = new Set<string>();
  for (const tag of tags ?? parent?.projectTags ?? []) {
    const normalized = tag.trim().toLowerCase();
    if (normalized) projectTags.add(normalized);
    if (projectTags.size === 8) break;
  }

  return {
    projectTags: [...projectTags],
    lastActivityAt: now,
    openedBy,
    ...(parent ? { parentThreadId: parent.id } : {}),
  };
}
