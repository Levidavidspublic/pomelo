import type { PomeloStore } from "./store.js";

export interface ProjectTag {
  slug: string;
  label: string;
  colour?: string;
  createdBy: string;
}

const TAG_PREFIX = "tag:";

export function tagSlug(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.slice(0, 40).replace(/-$/, "");
}

export async function saveTag(store: PomeloStore, tag: ProjectTag): Promise<void> {
  const key = TAG_PREFIX + tag.slug;
  // Claim the initial record atomically so concurrent saves agree on its first creator.
  if (await store.set(key, tag, "ifMissing")) return;
  const existing = await store.get<ProjectTag>(key);
  await store.set(key, { ...tag, createdBy: existing?.createdBy ?? tag.createdBy });
}

export function getTag(store: PomeloStore, slug: string): Promise<ProjectTag | null> {
  return store.get<ProjectTag>(TAG_PREFIX + slug);
}

export async function listTags(store: PomeloStore): Promise<ProjectTag[]> {
  return (await store.list<ProjectTag>(TAG_PREFIX)).map(({ value }) => value);
}
