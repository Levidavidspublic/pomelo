import type { ThreadMeta } from "./rail-order.js";

// These limits mirror src/pomelo/mesh-tools.ts.
const TAG_LIMIT = 32;
const TAG_COUNT_LIMIT = 8;

export function cleanTags(input: string | readonly string[]): { tags: string[] } | { error: string } {
  const entries = typeof input === "string" ? input.split(",") : input;
  const tags = new Set<string>();

  for (const entry of entries) {
    const tag = entry.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!tag) continue;
    if (tag.length > TAG_LIMIT) return { error: `Keep each tag to ${TAG_LIMIT} characters or fewer.` };
    tags.add(tag);
    if (tags.size > TAG_COUNT_LIMIT) return { error: `Use no more than ${TAG_COUNT_LIMIT} tags.` };
  }

  return { tags: [...tags] };
}

export function retagged(
  meta: Readonly<Record<string, ThreadMeta | undefined>>,
  sid: string,
  tags: readonly string[],
): Record<string, ThreadMeta | undefined> {
  const thread = Object.hasOwn(meta, sid) ? meta[sid] : undefined;
  return { ...meta, [sid]: { ...thread, projectTags: [...tags] } };
}

export function tagDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  const beforeTags = new Set(before);
  const afterTags = new Set(after);
  return {
    added: [...afterTags].filter((tag) => !beforeTags.has(tag)),
    removed: [...beforeTags].filter((tag) => !afterTags.has(tag)),
  };
}
