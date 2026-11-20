type AddedLine = { readonly line: number; readonly text: string };

type ChangedFile = { readonly path: string } & (
  | { readonly added: readonly AddedLine[] }
  | { readonly addedLines: readonly AddedLine[] }
);

const pomeloTest = /^test\/pomelo-[^/\r\n]*\.test\.ts$/;
const identifier = String.raw`[$_\p{ID_Start}][$\p{ID_Continue}\u200c\u200d]*`;
const start = String.raw`(?<![$#\p{ID_Continue}])(?<!\.\s*)`;
const dot = String.raw`\s*\.\s*`;
// The scanner marks quoted strings with NUL so bracket keys can be matched without scanning literal text.
const member = String.raw`(?:${dot}${identifier}|\s*\[\s*(?:${identifier}|\0)\s*\])`;
const write = /\s*(?:=(?!=|>)|(?:>>>|>>|<<|\*\*|&&|\|\||\?\?|[+\-*/%&|^])=)/.source;
const env = `process${dot}env${member}`;
const globalProperty = `(?:globalThis|global)${member}`;
const prototypeProperty = `${identifier}(?:${dot}${identifier})*${dot}prototype${member}`;
const assignment = (target: string) => `${start}(${target})${write}`;
const call = (target: string) => `${start}(${target})\\s*\\(`;
const deletion = (target: string) => `${start}delete\\s+(${target})(?![$\\p{ID_Continue}]|\\s*[.\\[(])`;

function rule<Id extends string>(id: Id, pattern: string, reason: string) {
  return Object.freeze({ id, pattern: Object.freeze(new RegExp(pattern, "u")), reason });
}

export const TEST_LEAK_RULES = Object.freeze([
  rule("env", assignment(env) + "|" + deletion(env),
    "Changes an environment variable without restoring it"),
  rule("chdir", call(`process${dot}chdir`), "Changes the working directory without restoring it"),
  rule("date-now", assignment(`Date${dot}now`), "Replaces the shared clock without restoring it"),
  rule("math-random", assignment(`Math${dot}random`), "Replaces the shared random function without restoring it"),
  rule("global", assignment(globalProperty), "Changes a global property without restoring it"),
  rule("prototype", assignment(prototypeProperty), "Changes a prototype property without restoring it"),
  rule("process-listener", call(`process${dot}(?:on|once)`), "Adds a process listener without removing it"),
]);

type RuleId = (typeof TEST_LEAK_RULES)[number]["id"];
type Finding = { path: string; line: number; rule: RuleId; reason: string };
type Range = { start: number; end: number };

const codeToken = /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\\r\n])*"?|'(?:\\[\s\S]|[^'\\\r\n])*'?|=>|[\s\S]/y;
const templateText = /(?:\\(?:[\s\S]|$)|[^\\\x60$]|\$(?!\{))*(\x60|\$\{|$)/y;
const regexLiteral = /\/(?:\\[^\r\n]|[^/\\[\r\n]|\[(?:\\[^\r\n]|[^\]\\\r\n])*\])+\/[dgimsuvy]*/y;
const regexPrefix = /(?:^|[=(:,;!&|?{\[]|=>|\b(?:return|throw|yield|case))\s*$/;
const spaces = (text: string) => text.replace(/[^\r\n]/g, " ");

function maskCode(source: string) {
  const token = new RegExp(codeToken);
  const template = new RegExp(templateText);
  const regex = new RegExp(regexLiteral);
  const literals = new Map<number, string>();
  const parts: string[] = [];
  const interpolations: number[] = [];
  let inTemplate = false;
  let previousCode = "";

  for (let offset = 0; offset < source.length;) {
    const scanner = inTemplate ? template : token;
    scanner.lastIndex = offset;
    const match = scanner.exec(source)!;
    let raw = match[0];
    if (!raw) break;
    let masked = raw;

    if (inTemplate) {
      masked = spaces(raw);
      if (match[1] === "${") {
        interpolations.push(1);
        masked = masked.slice(0, -1) + "(";
      }
      inTemplate = false;
    } else if (raw.startsWith("//") || raw.startsWith("/*")) {
      masked = spaces(raw);
    } else if (raw[0] === '"' || raw[0] === "'") {
      literals.set(offset, raw.slice(1, -1));
      masked = "\0" + spaces(raw.slice(1));
    } else if (raw === "/" && regexPrefix.test(previousCode)) {
      regex.lastIndex = offset;
      const literal = regex.exec(source);
      if (literal) {
        raw = literal[0];
        masked = "\x01" + spaces(raw.slice(1));
      }
    } else if (raw === "\x60") {
      inTemplate = true;
      masked = "\x01";
    } else if (interpolations.length && raw === "{") {
      interpolations[interpolations.length - 1]++;
    } else if (interpolations.length && raw === "}") {
      if (--interpolations[interpolations.length - 1] === 0) {
        interpolations.pop();
        inTemplate = true;
        masked = ")";
      }
    }

    parts.push(masked);
    if (masked.trim()) previousCode = (previousCode + masked).trimEnd().slice(-32);
    offset += raw.length;
  }
  return { code: parts.join(""), literals };
}

function groupEnds(code: string) {
  const ends = new Map<number, number>();
  const stack: { index: number; close: string }[] = [];
  for (const { 0: value, index } of code.matchAll(/[()[\]{}]/g)) {
    const close = { "(": ")", "[": "]", "{": "}" }[value];
    if (close) stack.push({ index, close });
    else if (stack.at(-1)?.close === value) ends.set(stack.pop()!.index, index);
  }
  return ends;
}

function argumentsIn(code: string, groups: ReadonlyMap<number, number>, start: number, end: number): Range[] {
  const args: Range[] = [];
  const delimiters = /[()[\]{},]/g;
  delimiters.lastIndex = start;
  for (let match; (match = delimiters.exec(code)) && match.index < end;) {
    const close = groups.get(match.index);
    if (close !== undefined) delimiters.lastIndex = close + 1;
    else if (match[0] === ",") {
      args.push({ start, end: match.index });
      start = match.index + 1;
    }
  }
  args.push({ start, end });
  return args;
}

function cleanupBodies(code: string, groups: ReadonlyMap<number, number>): Range[] {
  const marker = new RegExp(
    start + String.raw`(?:finally\s*(?<block>\{)|(?:afterEach|after|t${dot}after)\s*\()`, "gu");
  const prefix = new RegExp(String.raw`\s*(?:async\s+)?(?:(?<fn>function)(?:\s+${identifier})?\s*)?`, "uy");
  const parameter = new RegExp(identifier, "uy");
  const bodies: Range[] = [];

  for (const match of code.matchAll(marker)) {
    const open = match.index + match[0].length - 1;
    const end = groups.get(open) ?? code.length;
    if (match.groups?.block) {
      bodies.push({ start: open + 1, end });
      continue;
    }

    prefix.lastIndex = open + 1;
    const head = prefix.exec(code)!;
    parameter.lastIndex = prefix.lastIndex;
    const parametersEnd = code[parameter.lastIndex] === "("
      ? groups.get(parameter.lastIndex)
      : parameter.test(code) ? parameter.lastIndex - 1 : undefined;
    if (parametersEnd === undefined || parametersEnd >= end) continue;

    const body = head.groups?.fn ? /\s*(?=\{)/y : /\s*=>\s*/y;
    body.lastIndex = parametersEnd + 1;
    if (!body.test(code) || body.lastIndex >= end) continue;
    const bodyStart = body.lastIndex;
    if (code[bodyStart] === "{") {
      bodies.push({ start: bodyStart + 1, end: groups.get(bodyStart) ?? end });
    } else {
      bodies.push(argumentsIn(code, groups, bodyStart, end)[0]);
    }
  }
  return bodies;
}

const plainName = new RegExp(`^${identifier}$`, "u");
const listenerReference = new RegExp(`^${identifier}(?:\\.${identifier})*$`, "u");
const removeListener = new RegExp(call(`process${dot}(?:off|removeListener)`), "gu");
const deletePatch = new RegExp(deletion(`(?:${globalProperty}|${prototypeProperty})`), "gu");

function inspectChunk(path: string, lines: readonly AddedLine[], changes: Change[], restores: Map<string, Set<string>>) {
  const { code, literals } = maskCode(lines.map(({ text }) => text).join("\n"));
  const groups = groupEnds(code);
  const cleanup = cleanupBodies(code, groups);
  const inCleanup = (index: number) => cleanup.some(({ start, end }) => start <= index && index < end);
  const lineStarts = [0];
  for (const { index } of code.matchAll(/\n/g)) lineStarts.push(index + 1);

  function argumentKeys(open: number) {
    const end = groups.get(open);
    if (end === undefined) return [];
    return argumentsIn(code, groups, open + 1, end).map(({ start, end }) =>
      code.slice(start, end).replace(/\s+|\0/g, (part, index: number) =>
        part === "\0" ? JSON.stringify(literals.get(start + index)) ?? "\0" : ""));
  }

  function remember(key: string, arg = "") {
    const values = restores.get(key) ?? new Set<string>();
    values.add(arg);
    restores.set(key, values);
  }

  function listenerKey(open: number) {
    const [event, handler] = argumentKeys(open);
    return event && handler && listenerReference.test(handler) ? JSON.stringify([event, handler]) : undefined;
  }

  function targetName(target: string, offset: number) {
    let label = target.replace(/\s+/g, "");
    let key = label;
    const literalOffset = target.indexOf("\0");
    if (literalOffset !== -1) {
      const name = literals.get(offset + literalOffset);
      const dotName = name && plainName.test(name) ? "." + name : undefined;
      label = label.replace("[\0]", dotName ?? "[…]");
      key = key.replace("[\0]", dotName ?? "[" + JSON.stringify(name) + "]");
    }
    if (key.startsWith("global.") || key.startsWith("global[")) key = "globalThis" + key.slice(6);
    return { key, label };
  }

  for (const match of code.matchAll(removeListener)) {
    if (!inCleanup(match.index)) continue;
    const key = listenerKey(match.index + match[0].length - 1);
    if (key) remember(key);
  }
  for (const match of code.matchAll(deletePatch)) {
    if (!inCleanup(match.index)) continue;
    const { key } = targetName(match[1], match.index + match[0].indexOf(match[1]));
    remember(key);
  }

  for (const { id, pattern, reason } of TEST_LEAK_RULES) {
    let lineIndex = 0;
    for (const match of code.matchAll(new RegExp(pattern, "gu"))) {
      const target = match[1] ?? match[2];
      const offset = match.index + match[0].indexOf(target);
      while (lineStarts[lineIndex + 1] <= offset) lineIndex++;

      const { key, label } = targetName(target, offset);
      const end = match.index + match[0].length;
      const arg = id === "chdir" ? argumentKeys(end - 1)[0] : undefined;
      const isRestore = id === "chdir"
        ? arg && arg !== "process.cwd()"
        : match[2] !== undefined || code.slice(offset + target.length, end).trim() === "=";
      if (isRestore && inCleanup(offset)) {
        remember(key, arg);
        continue;
      }
      changes.push({
        finding: { path, line: lines[lineIndex].line, rule: id, reason: reason + " (" + label + ")" },
        key: id === "process-listener" ? listenerKey(end - 1) : key,
        arg,
      });
    }
  }
}

type Change = { finding: Finding; key: string | undefined; arg: string | undefined };

/** Check direct changes and cleanup visible in the added lines of each Pomelo test. */
export function testLeakGuard(files: readonly ChangedFile[], allow: readonly string[] = []): Finding[] {
  const allowedPaths = new Set(allow);
  const findings: Finding[] = [];
  for (const file of files) {
    const { path } = file;
    if (!pomeloTest.test(path.replaceAll("\\", "/")) || allowedPaths.has(path)) continue;
    const changes: Change[] = [];
    const restores = new Map<string, Set<string>>();
    const lines = [...("added" in file ? file.added : file.addedLines)].sort((a, b) => a.line - b.line);
    let start = 0;
    // Gaps can hide the ends of comments, strings and callbacks.
    for (let index = 1; index <= lines.length; index++) {
      if (lines[index]?.line === lines[index - 1].line + 1) continue;
      inspectChunk(path, lines.slice(start, index), changes, restores);
      start = index;
    }
    const reported = new Set<string>();
    for (const { finding, key, arg } of changes) {
      const matches = key === undefined ? undefined : restores.get(key);
      if (matches && (finding.rule !== "chdir" || [...matches].some((value) => value !== arg))) continue;
      const identity = JSON.stringify([finding.line, finding.rule, finding.reason]);
      if (reported.has(identity)) continue;
      reported.add(identity);
      findings.push(finding);
    }
  }
  return findings.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
}
