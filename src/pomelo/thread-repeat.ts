export const REPEAT_WINDOW_MS = 120_000;

interface ThreadAsk {
  parentThreadId: string;
  openedBy: string;
  title: string;
  projectTags: string[];
  now: number;
}

interface OpenedThread {
  id: string;
  parentThreadId?: string;
  openedBy: string;
  title: string;
  projectTags: string[];
  lastActivityAt: number;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function sameTags(expected: Set<string>, tags: string[]): boolean {
  return new Set(tags).size === expected.size && tags.every((tag) => expected.has(tag));
}

export function threadRepeat(
  ask: ThreadAsk,
  opened: OpenedThread[],
): { action: "open" } | { action: "reuse"; threadId: string } {
  const title = normalizeTitle(ask.title);
  const tags = new Set(ask.projectTags);
  let newest: OpenedThread | undefined;

  for (const thread of opened) {
    const age = ask.now - thread.lastActivityAt;
    if (!(age >= 0 && age <= REPEAT_WINDOW_MS)) continue;
    if (thread.parentThreadId !== ask.parentThreadId || thread.openedBy !== ask.openedBy) continue;
    if (normalizeTitle(thread.title) !== title || !sameTags(tags, thread.projectTags)) continue;
    if (!newest || thread.lastActivityAt > newest.lastActivityAt) newest = thread;
  }

  return newest ? { action: "reuse", threadId: newest.id } : { action: "open" };
}
