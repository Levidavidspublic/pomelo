import type { PomeloStore } from "./store.js";
import { tagSlug, type ProjectTag } from "./tags.js";
import { setProjectTags } from "./thread-meta.js";

const TAG_LIMIT = 8;

type RetagResult =
  | { ok: true; tags: string[]; added: string[]; removed: string[] }
  | { ok: false; error: string };

export async function retagThread(
  store: PomeloStore, { sid, labels, by }: { sid: string; labels: readonly string[]; by: string },
): Promise<RetagResult> {
  try {
    const labelsBySlug = new Map<string, string>();
    for (const label of labels) {
      const slug = tagSlug(label);
      if (!slug || labelsBySlug.has(slug)) continue;
      labelsBySlug.set(slug, label);
      if (labelsBySlug.size > TAG_LIMIT) return { ok: false, error: `Use no more than ${TAG_LIMIT} tags.` };
    }

    const tags = [...labelsBySlug.keys()];
    const previous = new Set(await setProjectTags(store, sid, tags, async () => {
      for (const [slug, label] of labelsBySlug) {
        const tag: ProjectTag = { slug, label, createdBy: by };
        // Claim only missing records so overlapping retags preserve the original label and creator.
        await store.set(`tag:${slug}`, tag, "ifMissing");
      }
    }));

    return {
      ok: true,
      tags,
      added: tags.filter((slug) => !previous.has(slug)),
      removed: [...previous].filter((slug) => !labelsBySlug.has(slug)),
    };
  } catch {
    return { ok: false, error: "Could not retag the thread." };
  }
}
