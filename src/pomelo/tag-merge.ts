export interface TagMergeTag {
  slug: string;
  label: string;
  colour?: string;
  createdBy: string;
  mergedInto?: string;
}

export interface TagMergeThread {
  sid: string;
  projectTags: readonly string[];
}

export interface TagMergeInput {
  fromSlug: string;
  intoSlug: string;
  tags: readonly TagMergeTag[];
  threads: readonly TagMergeThread[];
}

export interface TagMergeThreadWrite {
  sid: string;
  projectTags: string[];
}

export type TagMergeResult =
  | { ok: true; threadWrites: TagMergeThreadWrite[]; tagWrite: TagMergeTag & { mergedInto: string } }
  | { ok: false; reason: "same-slug" | "unknown-tag" | "target-merged" | "source-has-aliases" };

export function planTagMerge({ fromSlug, intoSlug, tags, threads }: TagMergeInput): TagMergeResult {
  if (fromSlug === intoSlug) return { ok: false, reason: "same-slug" };

  const source = tags.find((tag) => tag.slug === fromSlug);
  const target = tags.find((tag) => tag.slug === intoSlug);
  if (!source || !target) return { ok: false, reason: "unknown-tag" };
  if (target.mergedInto !== undefined) return { ok: false, reason: "target-merged" };

  // Redirecting the source alone would leave its existing aliases pointing at another alias.
  if (tags.some((tag) => tag.mergedInto === fromSlug)) return { ok: false, reason: "source-has-aliases" };

  const threadWrites: TagMergeThreadWrite[] = [];
  for (const { sid, projectTags } of threads) {
    if (!projectTags.includes(fromSlug)) continue;
    const replaced = projectTags.map((slug) => (slug === fromSlug ? intoSlug : slug));
    threadWrites.push({ sid, projectTags: [...new Set(replaced)] });
  }

  threadWrites.sort((a, b) => {
    if (a.sid === b.sid) return 0;
    return a.sid < b.sid ? -1 : 1;
  });
  return { ok: true, threadWrites, tagWrite: { ...source, mergedInto: intoSlug } };
}
