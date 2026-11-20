export interface TagArchiveTag {
  slug: string;
  name: string;
  archivedAt?: number;
}

export interface TagArchiveThread {
  sid: string;
  projectTags: readonly string[];
}

type TagArchiveResult =
  | { ok: true; tags: TagArchiveTag[] }
  | { ok: false; tags: TagArchiveTag[]; reason: string };

export function archiveTag(tags: readonly TagArchiveTag[], slug: string, by: string, now: number): TagArchiveResult {
  const next = [...tags];
  if (by !== "amit") return { ok: false, tags: next, reason: "Only Amit can archive projects." };

  const index = next.findIndex((tag) => tag.slug === slug);
  if (index === -1) return { ok: false, tags: next, reason: "Project not found." };
  const tag = next[index];
  if (tag.archivedAt !== undefined) return { ok: false, tags: next, reason: "Project is already archived." };

  next[index] = { ...tag, archivedAt: now };
  return { ok: true, tags: next };
}

export function restoreTag(tags: readonly TagArchiveTag[], slug: string, by: string): TagArchiveResult {
  const next = [...tags];
  if (by !== "amit") return { ok: false, tags: next, reason: "Only Amit can restore projects." };

  const index = next.findIndex((tag) => tag.slug === slug);
  if (index === -1) return { ok: false, tags: next, reason: "Project not found." };
  const tag = next[index];
  if (tag.archivedAt === undefined) return { ok: false, tags: next, reason: "Project is not archived." };

  const restored = { ...tag };
  delete restored.archivedAt;
  next[index] = restored;
  return { ok: true, tags: next };
}

/** Give each thread one rail group, using the order of its stored tags. */
export function visibleGroups(
  tags: readonly TagArchiveTag[], threads: readonly TagArchiveThread[],
): Record<string, string[]> {
  const archived = new Set(tags.filter((tag) => tag.archivedAt !== undefined).map((tag) => tag.slug));
  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const { sid, projectTags } of threads) {
    if (seen.has(sid)) continue;
    seen.add(sid);

    const slug = projectTags.find((tag) => !archived.has(tag)) ?? "untagged";
    const group = groups.get(slug);
    if (group) group.push(sid);
    else groups.set(slug, [sid]);
  }
  return Object.fromEntries(groups);
}

export function tagChoices(tags: readonly TagArchiveTag[]): TagArchiveTag[] {
  return tags.filter((tag) => tag.archivedAt === undefined);
}

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase().normalize("NFC");
}

export function nameTaken(tags: readonly TagArchiveTag[], name: string): boolean {
  const key = nameKey(name);
  return tags.some((tag) => nameKey(tag.name) === key);
}
