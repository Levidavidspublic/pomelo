interface AddedLine {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

const MESSAGES = {
  "todo-marker": "A comment contains an unfinished-work marker.",
  "not-implemented": "An error throw indicates missing implementation.",
  placeholder: "A comment indicates temporary or deferred implementation.",
};

type Reason = keyof typeof MESSAGES;
type Problem = { path: string; line: number; reason: Reason; message: string };

const POMELO_PATH = /^src\/(?:client\/)?pomelo\//;
const TEST_PATH = /\/(?:__tests__|tests?)\/|\.(?:test|spec)\.[^/]+$/;

// Consume literals and comments together so quoted delimiters stay inside the literal.
const TOKEN = /(?<comment>\/\/.*|\/\*.*?(?:\*\/|$)|^\s*\*(?!\/).*?(?:\*\/|$))|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
const TODO_MARKER = /\b(?:todo|fixme|xxx|hack)\b/i;
const PLACEHOLDER = /\b(?:placeholder|implement\s+later)\b/i;
const STUB_MESSAGE = /\b(?:not\s+implemented|unimplemented|stub)\b/i;
const THROW_PREFIX = /(?<![\w$.])throw\s+new\s+Error\s*\(\s*$/;

function unfinishedReason(text: string): Reason | undefined {
  let commentReason: Reason | undefined;

  for (const match of text.matchAll(TOKEN)) {
    const comment = match.groups?.comment;
    if (comment !== undefined) {
      if (TODO_MARKER.test(comment)) commentReason = "todo-marker";
      else if (PLACEHOLDER.test(comment)) commentReason ??= "placeholder";
    } else if (STUB_MESSAGE.test(match[0].slice(1, -1)) && THROW_PREFIX.test(text.slice(0, match.index))) {
      return "not-implemented";
    }
  }

  return commentReason;
}

/** Report unfinished-work signals on added Pomelo production lines. */
export function unfinishedWorkCheck(addedLines: readonly AddedLine[]): { ok: boolean; problems: Problem[] } {
  const problems: Problem[] = [];

  for (const { path: addedPath, line, text } of addedLines) {
    const path = addedPath.replaceAll("\\", "/");
    if (!POMELO_PATH.test(path) || TEST_PATH.test(path)) continue;

    const reason = unfinishedReason(text);
    if (reason) problems.push({ path, line, reason, message: MESSAGES[reason] });
  }

  problems.sort((a, b) => {
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return a.line - b.line;
  });
  return { ok: problems.length === 0, problems };
}
