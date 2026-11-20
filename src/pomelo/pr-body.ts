type Problem = { code: string; line?: number; reason: string };

type ResultFence = {
  marker: string;
  hasTests: boolean;
  hasFailCount: boolean;
  failedLine?: number;
  zeroLine?: number;
};

const OPEN_FENCE = /^(`{3,})[^`]*$|^(~{3,}).*$/;
const CLOSE_FENCE = /^(?:`{3,}|~{3,})$/;
const RUN_COUNT = /^(?:#|ℹ)\s+(tests|pass|fail)\s+(\d+)$/;
const CLOSING_LINE = /^Closes[ \t]+#\d+$/i;
const PLACEHOLDER = /<(?:!--\s*)?(?:paste|insert|replace|list|describe|summarize|fill in)\s+[^<>]+>|<!--\s*(?:For someone using Friday: what's different after this\?|Tests you added or ran, and what you tried by hand\.)\s*-->/i;

export function checkPrBody(body: string, doneCommand: string): { ok: boolean; problems: Problem[] } {
  if (!body.trim()) {
    return { ok: false, problems: [{ code: "empty-body", reason: "The PR body is empty." }] };
  }

  const command = doneCommand.trim();
  const closingLines: number[] = [];
  const placeholders: Problem[] = [];
  let commandLine: number | undefined;
  let failedLine: number | undefined;
  let zeroLine: number | undefined;
  let hasResult = false;
  let inComment = false;
  let fence: ResultFence | undefined;

  for (const [index, rawLine] of body.split(/\r\n?|\n/).entries()) {
    const lineNumber = index + 1;
    let line = rawLine.trim();
    if (PLACEHOLDER.test(line)) {
      placeholders.push({ code: "template-placeholder", line: lineNumber, reason: "Replace the PR template placeholder." });
    }

    if (fence && CLOSE_FENCE.test(line) && line.startsWith(fence.marker)) {
      failedLine ??= fence.failedLine;
      zeroLine ??= fence.zeroLine;
      hasResult ||= (fence.hasTests && fence.hasFailCount) || fence.failedLine !== undefined || fence.zeroLine !== undefined;
      fence = undefined;
      continue;
    }

    if (!fence) {
      if (inComment) {
        const end = line.indexOf("-->");
        if (end === -1) continue;
        line = line.slice(end + 3);
        inComment = false;
      }
      line = line.replace(/<!--(?:.*?-->|.*$)/g, (comment) => {
        inComment = !comment.endsWith("-->");
        return " ";
      }).trim();

      const opening = OPEN_FENCE.exec(line);
      if (opening) {
        fence = { marker: opening[1] ?? opening[2], hasTests: false, hasFailCount: false };
        continue;
      }
      if (CLOSING_LINE.test(line)) closingLines.push(lineNumber);
    }

    if (command && (line === command || line === `$ ${command}` ||
      (!fence && (line === `DONE: ${command}` || line.includes(`\`${command}\``))))) {
      commandLine ??= lineNumber;
      continue;
    }

    if (!fence || commandLine === undefined) continue;
    const count = RUN_COUNT.exec(line.replace(/\x1b\[[\d;]*m/g, "").trim());
    if (!count) continue;

    const [, label, value] = count;
    const isZero = Number(value) === 0;
    if (label === "tests") {
      fence.hasTests = true;
      fence.hasFailCount = false;
    }
    if (label === "fail") {
      fence.hasFailCount = true;
      if (!isZero) fence.failedLine ??= lineNumber;
    } else if (isZero) {
      fence.zeroLine ??= lineNumber;
    }
  }

  const problems: Problem[] = [];
  if (commandLine === undefined) {
    problems.push({ code: "missing-done-command", reason: "Add the exact DONE command." });
  } else if (!hasResult) {
    problems.push({ code: "missing-done-result", line: commandLine, reason: "Paste a fenced test summary after the DONE command." });
  }
  if (failedLine !== undefined) {
    problems.push({ code: "failed-tests", line: failedLine, reason: "The pasted result shows failed tests." });
  }
  if (zeroLine !== undefined) {
    problems.push({ code: "zero-tests", line: zeroLine, reason: "The pasted result shows zero tests or zero passes." });
  }
  if (closingLines.length === 0) {
    problems.push({ code: "missing-closing-line", reason: "Add a Closes #<n> line." });
  } else if (closingLines.length > 1) {
    problems.push({ code: "multiple-closing-lines", line: closingLines[1], reason: "Keep exactly one Closes #<n> line." });
  }
  problems.push(...placeholders);

  return { ok: problems.length === 0, problems };
}
