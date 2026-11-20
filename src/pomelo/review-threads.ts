export interface OpenReviewThread {
  path: string;
  line: number | null;
  author: string;
  reason: string;
}

export interface ReviewThreadsResult {
  ok: boolean;
  open: OpenReviewThread[];
  problems: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function reviewThreads(payload: unknown): unknown {
  if (isRecord(payload) && "data" in payload) {
    const repository = field(payload.data, "repository");
    return field(field(repository, "pullRequest"), "reviewThreads");
  }
  return field(payload, "reviewThreads");
}

function timestamp(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const day = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  if (!day) return NaN;
  // Date.parse can roll an impossible calendar date forward into the next month.
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return NaN;
  return Date.parse(value);
}

/**
 * Read a pull request's `reviewThreads` connection from the PR object or a GraphQL response.
 * The caller can supply `fileChangedAt` on a thread as the ISO timestamp of the last change
 * to that thread's file. Comment nodes start with the thread's opening comment.
 */
export function checkReviewThreads(jsonText: string, reviewers: readonly string[]): ReviewThreadsResult {
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return { ok: false, open: [], problems: ["Review threads could not be read as JSON."] };
  }

  const open: OpenReviewThread[] = [];
  const problems: string[] = [];
  const errors = field(payload, "errors");
  if (errors !== undefined && (!Array.isArray(errors) || errors.length > 0)) {
    problems.push("The review threads response reported errors.");
  }

  const connection = reviewThreads(payload);
  const nodes = field(connection, "nodes");
  if (!Array.isArray(nodes)) {
    problems.push("The review threads list is missing.");
    return { ok: false, open, problems };
  }

  const pageInfo = field(connection, "pageInfo");
  if (pageInfo !== undefined) {
    const hasNextPage = field(pageInfo, "hasNextPage");
    if (hasNextPage === true) {
      problems.push("The review threads list has more pages.");
    } else if (hasNextPage !== false) {
      problems.push("The review threads list has invalid paging information.");
    }
  }

  const counted = new Set(reviewers.map(login => login.toLowerCase()));
  for (const [index, node] of nodes.entries()) {
    const thread: unknown = node;
    if (!isRecord(thread) || typeof thread.isResolved !== "boolean") {
      problems.push(`Review thread ${index + 1} is missing a valid resolution status.`);
      continue;
    }
    if (thread.isResolved) continue;

    const comments = field(thread.comments, "nodes");
    const firstComment: unknown = Array.isArray(comments) ? comments[0] : undefined;
    const author = field(field(firstComment, "author"), "login");
    if (typeof author !== "string" || !author.trim()) {
      problems.push(`Review thread ${index + 1} is missing its first comment's author.`);
      continue;
    }
    if (!counted.has(author.toLowerCase())) continue;

    const { path, line, isOutdated } = thread;
    if (typeof path !== "string" || !path.trim() ||
        (line !== null && (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1))) {
      problems.push(`Review thread ${index + 1} is missing a valid file location.`);
      continue;
    }
    if (typeof isOutdated !== "boolean") {
      problems.push(`Review thread ${index + 1} is missing a valid outdated status.`);
      continue;
    }
    if (isOutdated && timestamp(thread.fileChangedAt) > timestamp(field(firstComment, "createdAt"))) continue;

    open.push({
      path,
      line,
      author,
      reason: isOutdated
        ? "Outdated thread has no confirmed file change after its first comment."
        : "Review thread is unresolved.",
    });
  }

  return { ok: open.length === 0 && problems.length === 0, open, problems };
}
