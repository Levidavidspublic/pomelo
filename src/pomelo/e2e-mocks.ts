export interface AddedLine {
  path: string;
  line: number;
  text: string;
}

export interface E2eMockFinding {
  path: string;
  line: number;
  kind: "route" | "fulfill" | "har" | "abort" | "init-script" | "expose-function" | "tool-stub";
  reason: string;
}

const callRules = [
  [/\b(?:page|context)\s*\.\s*route\s*\(/, "route", "Playwright routing intercepts real requests."],
  [/\broute\s*\.\s*fulfill\s*\(/, "fulfill", "route.fulfill supplies a test response in place of the server response."],
  [/\brouteFromHAR\s*\(/, "har", "routeFromHAR replays recorded responses."],
  [/\broute\s*\.\s*abort\s*\(/, "abort", "route.abort blocks a real request."],
  [/\bpage\s*\.\s*exposeFunction\s*\(/, "expose-function", "page.exposeFunction lets the test supply a browser function."],
] as const;

// Keep quoted text available for script content and tool names. Mask it when looking for calls.
const nonCode = /\/\/.*|\/\*.*?(?:\*\/|$)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
const initScript = /\baddInitScript\s*\(/;
const networkOverrides = [
  /(?:\b(?:fetch|EventSource)|\[\s*["'](?:fetch|EventSource)["']\s*\])\s*=(?![=>])/,
  /\bdefineProperty\s*\([^,]+,\s*["'](?:fetch|EventSource)["']/,
  /\bObject\s*\.\s*assign\s*\([^,]+,\s*\{[^}]*\b(?:fetch|EventSource)["']?\s*:/,
];
const toolName = /(?<![\w$])(["']?)(open_thread|spawn_subagent|tag_project)\1(?![\w$])/g;
const mockSetup = /\b(?:mock|stub|fake)(?:[A-Z_]\w*)?\s*[=(]|\.\s*(?:mock\w+|callsFake|returns)\s*\(/;
const replacement = /^\s*\]?\s*(?:=(?![=>])|:\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>|(?:vi|jest)\s*\.\s*fn\s*\())/;

export function isE2eFile(path: string): boolean {
  return typeof path === "string" && /\.spec\.ts$|(?:^|\/)(?:e2e|playwright)\//.test(path.replaceAll("\\", "/"));
}

function isAddedLine(value: unknown): value is AddedLine {
  if (value === null || typeof value !== "object") return false;
  const { path, line, text } = value as Partial<AddedLine>;
  return typeof path === "string" && typeof line === "number" && Number.isSafeInteger(line) && line > 0
    && typeof text === "string";
}

function scanLines(lines: AddedLine[]) {
  let previousLine = 0;
  let inBlockComment = false;
  return lines.map((line) => {
    let source = line.text;
    if (inBlockComment && line.line === previousLine + 1) {
      const end = source.indexOf("*/");
      source = end === -1 ? "" : source.slice(end + 2);
      inBlockComment = end === -1;
    } else {
      inBlockComment = false;
      if (/^\s*\*(?:\s|\/|$)/.test(source)) source = "";
    }
    previousLine = line.line;

    const text = source.replace(nonCode, (part) => {
      if (!part.startsWith("/")) return part;
      inBlockComment = part.startsWith("/*") && !part.slice(2).endsWith("*/");
      return " ".repeat(part.length);
    });
    const code = text.replace(nonCode, (part) => " ".repeat(part.length));
    return { ...line, text, code };
  });
}

// An init script can span consecutive added lines. Stop at the call's closing parenthesis or at a gap.
function overridesNetwork(lines: ReturnType<typeof scanLines>, start: number, offset: number): boolean {
  let depth = 1;
  for (let index = start; index < lines.length; index++) {
    const { line, code, text } = lines[index];
    if (index > start && line !== lines[index - 1].line + 1) break;

    let end = code.length;
    for (const match of code.slice(offset).matchAll(/[()]/g)) {
      depth += match[0] === "(" ? 1 : -1;
      if (depth !== 0) continue;
      end = offset + match.index;
      break;
    }
    const argument = text.slice(offset, end);
    if (networkOverrides.some((pattern) => pattern.test(argument))) return true;
    if (depth === 0) break;
    offset = 0;
  }
  return false;
}

/** Report the added lines that can replace real traffic or agent calls in Playwright checks. */
export function e2eMockLines(added: AddedLine[]): E2eMockFinding[] {
  if (!Array.isArray(added)) return [];

  const files = new Map<string, AddedLine[]>();
  for (const value of added) {
    if (!isAddedLine(value) || !isE2eFile(value.path)) continue;
    const path = value.path.replaceAll("\\", "/");
    const lines = files.get(path);
    if (lines) lines.push(value);
    else files.set(path, [value]);
  }

  const findings: E2eMockFinding[] = [];
  for (const lines of files.values()) {
    const scanned = scanLines(lines.sort((a, b) => a.line - b.line));
    for (const [index, { path, line, text, code }] of scanned.entries()) {
      const call = callRules.find(([pattern]) => pattern.test(code));
      if (call) {
        findings.push({ path, line, kind: call[1], reason: call[2] });
        continue;
      }

      const init = initScript.exec(code);
      if (init && overridesNetwork(scanned, index, init.index + init[0].length)) {
        findings.push({ path, line, kind: "init-script", reason: "addInitScript replaces fetch or EventSource in the browser." });
        continue;
      }

      for (const match of text.matchAll(toolName)) {
        const [name, quote, tool] = match;
        if (!quote && code[match.index] !== tool[0]) continue;
        if (!mockSetup.test(code) && !replacement.test(code.slice(match.index + name.length))) continue;
        findings.push({ path, line, kind: "tool-stub", reason: `The test supplies a substitute for ${tool}.` });
        break;
      }
    }
  }
  return findings;
}
