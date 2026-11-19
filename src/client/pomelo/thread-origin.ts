export interface ThreadOriginInput {
  sid: string;
  title: string;
  openedBy?: string;
  parentThreadId?: string;
}

type ThreadLink = Pick<ThreadOriginInput, "sid" | "title">;

export interface ThreadOriginResult {
  openedByLabel: string | null;
  parent: ThreadLink | null;
  trail: ThreadLink[];
  note: string | null;
}

const MAX_ANCESTORS = 8;
const MAX_TITLE_LENGTH = 120;
const titleSegments = new Intl.Segmenter();

function linkTitle(rawTitle: string): string {
  const title = rawTitle.trim();
  if (title.length <= MAX_TITLE_LENGTH) return title || "Untitled";
  const end = titleSegments.segment(title).containing(MAX_TITLE_LENGTH)?.index ?? MAX_TITLE_LENGTH;
  return title.slice(0, end).trimEnd() || "Untitled";
}

export function threadOrigin(
  thread: ThreadOriginInput,
  threadsById: ReadonlyMap<string, ThreadOriginInput>,
): ThreadOriginResult {
  const opener = thread.openedBy?.trim();
  const openedByLabel = opener && opener !== "amit" ? `Opened by ${opener}` : null;
  const trail: ThreadLink[] = [];
  const seen = new Set([thread.sid]);
  let ancestorId = thread.parentThreadId;
  let note: string | null = null;

  while (ancestorId) {
    if (seen.has(ancestorId)) {
      note = "parent thread loop";
      break;
    }
    if (trail.length === MAX_ANCESTORS) break;

    const ancestor = threadsById.get(ancestorId);
    if (!ancestor) {
      note = "parent thread not found";
      break;
    }

    seen.add(ancestorId);
    trail.push({ sid: ancestor.sid, title: linkTitle(ancestor.title) });
    ancestorId = ancestor.parentThreadId;
  }

  const parent = trail[0] ?? null;
  return { openedByLabel, parent, trail: trail.reverse(), note };
}
