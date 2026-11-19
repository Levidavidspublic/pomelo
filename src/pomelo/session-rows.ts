import type { PomeloStore } from "./store.js";
import { threadMetaMap, type ThreadRecord } from "./thread-meta.js";

export { pomeloStore } from "./store.js";

interface SessionRow {
  sid: string;
  at: number;
}

interface ThreadRowMeta {
  projectTags: string[];
  lastActivityAt: number;
  openedBy?: string;
  parentThreadId?: string;
}

export function withThreadMeta<Row extends SessionRow>(
  rows: readonly Row[],
  meta: Readonly<Record<string, ThreadRecord>>,
): (Row & ThreadRowMeta)[] {
  return rows.map((row) => {
    const record = Object.hasOwn(meta, row.sid) ? meta[row.sid] : undefined;
    const { projectTags = [], lastActivityAt = row.at, openedBy, parentThreadId } = record ?? {};
    return {
      ...row,
      projectTags: [...projectTags],
      lastActivityAt: Number.isFinite(lastActivityAt) ? lastActivityAt : row.at,
      ...(typeof openedBy === "string" && openedBy.length > 0 ? { openedBy } : {}),
      ...(typeof parentThreadId === "string" && parentThreadId.length > 0 ? { parentThreadId } : {}),
    };
  });
}

export async function sessionRowsWithMeta<Row extends SessionRow>(
  store: PomeloStore,
  rows: readonly Row[],
): Promise<readonly (Row & Partial<ThreadRowMeta>)[]> {
  try {
    return withThreadMeta(rows, await threadMetaMap(store));
  } catch {
    return rows;
  }
}
