import type { MeshResult } from "../agent-mesh.js";
import { openThreadAsk, spawnSubagentAsk, tagProjectAsk } from "./mesh-tools.js";
import type { PomeloStore } from "./store.js";
import { getTag, saveTag, tagSlug } from "./tags.js";

export interface PomeloMeshDeps {
  createThread(request: {
    title: string;
    prompt: string;
    projectTags: string[];
    openedBy: string;
    parentThreadId: string;
    lastActivityAt: number;
  }): Promise<{ id: string; title: string }>;
  addLane(sid: string, request: {
    purpose: string;
    prompt: string;
    tool?: string;
    spawnedBy: string;
    status: "waiting";
  }): Promise<{ name: string }>;
  /** Merge into the session's projectTags in one update, keeping existing tags without duplicates. */
  addProjectTags(sid: string, slugs: string[]): Promise<void>;
  store: PomeloStore;
  now(): number;
}

function tagsBySlug(labels: string[]): Map<string, string> | string {
  const tags = new Map<string, string>();
  for (const label of labels) {
    const slug = tagSlug(label);
    if (!slug) return "Each tag needs at least one ASCII letter or number.";
    tags.set(slug, label);
  }
  return tags;
}

export async function pomeloMeshCall(
  deps: PomeloMeshDeps, sid: string, lane: string, name: string, args: Record<string, unknown>,
): Promise<MeshResult | null> {
  try {
    switch (name) {
      case "open_thread": {
        const ask = openThreadAsk(args);
        if (typeof ask === "string") return { output: ask, isError: true };
        const tags = tagsBySlug(ask.tags);
        if (typeof tags === "string") return { output: tags, isError: true };
        const thread = await deps.createThread({
          title: ask.title,
          prompt: ask.prompt,
          projectTags: [...tags.keys()],
          openedBy: lane,
          parentThreadId: sid,
          lastActivityAt: deps.now(),
        });
        return { output: `Opened thread "${thread.title}" (${thread.id}).` };
      }
      case "spawn_subagent": {
        const ask = spawnSubagentAsk(args);
        if (typeof ask === "string") return { output: ask, isError: true };
        const subagent = await deps.addLane(sid, { ...ask, spawnedBy: lane, status: "waiting" });
        return { output: `Spawned subagent "${subagent.name}".` };
      }
      case "tag_project": {
        const ask = tagProjectAsk(args);
        if (typeof ask === "string") return { output: ask, isError: true };
        const tags = tagsBySlug(ask.tags);
        if (typeof tags === "string") return { output: tags, isError: true };
        for (const [slug, label] of tags) {
          const existing = await getTag(deps.store, slug);
          await saveTag(deps.store, { ...existing, slug, label, createdBy: lane });
        }
        const slugs = [...tags.keys()];
        await deps.addProjectTags(sid, slugs);
        return { output: `Tagged this thread: ${slugs.join(", ")}.` };
      }
      default:
        return null;
    }
  } catch {
    return { output: `Could not complete ${name}.`, isError: true };
  }
}
