import { cleanThreadTitle } from "./thread-title.js";

type RailChangeKind = "thread-activity" | "thread-tags" | "thread-title";

interface RailFields {
  title: string;
  projectTags: readonly string[];
  lastActivityAt?: number;
  openedBy?: string;
  parentThreadId?: string;
}

export type RailEvent = { sid: string } & (
  | ({ kind: "thread-opened" } & RailFields)
  | ({ kind: RailChangeKind | readonly RailChangeKind[] } & Partial<RailFields>)
);

function hideTitle(title: string): string {
  // Use the title cleaner only for detection so the original graphemes stay intact.
  return cleanThreadTitle(title).reasons.includes("secret") ? "[hidden]" : title;
}

function readThread(value: unknown): ({ sid: string } & RailFields) | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const { sid, title, projectTags, lastActivityAt, openedBy, parentThreadId } = value as Record<string, unknown>;
  if (typeof sid !== "string" || !sid.trim()) return;
  if (title !== undefined && typeof title !== "string") return;
  if (lastActivityAt !== undefined && (typeof lastActivityAt !== "number" || !Number.isFinite(lastActivityAt))) return;
  if (openedBy !== undefined && typeof openedBy !== "string") return;
  if (parentThreadId !== undefined && typeof parentThreadId !== "string") return;
  if (projectTags !== undefined && !Array.isArray(projectTags)) return;
  const tags: unknown[] = Array.from(projectTags ?? []);
  if (!tags.every((tag) => typeof tag === "string")) return;

  return {
    sid,
    title: hideTitle(title ?? ""),
    projectTags: [...new Set(tags)].sort(),
    ...(lastActivityAt === undefined ? {} : { lastActivityAt }),
    ...(openedBy === undefined ? {} : { openedBy }),
    ...(parentThreadId === undefined ? {} : { parentThreadId }),
  };
}

export function buildRailEvent(before: unknown, after: unknown): RailEvent | undefined {
  const current = readThread(after);
  if (!current) return;
  if (before === undefined || before === null) return { kind: "thread-opened", ...current };

  const previous = readThread(before);
  if (!previous || previous.sid !== current.sid) return;

  const kinds: RailChangeKind[] = [];
  const changes: Partial<RailFields> = {};
  if (current.lastActivityAt !== undefined && current.lastActivityAt > (previous.lastActivityAt ?? -Infinity)) {
    kinds.push("thread-activity");
    changes.lastActivityAt = current.lastActivityAt;
  }
  if (current.projectTags.length !== previous.projectTags.length ||
      current.projectTags.some((tag, index) => tag !== previous.projectTags[index])) {
    kinds.push("thread-tags");
    changes.projectTags = current.projectTags;
  }
  if (current.title !== previous.title) {
    kinds.push("thread-title");
    changes.title = current.title;
  }
  if (kinds.length === 0) return;
  return { kind: kinds.length === 1 ? kinds[0] : kinds, sid: current.sid, ...changes };
}
