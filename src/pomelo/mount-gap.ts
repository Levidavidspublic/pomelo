import posix from "node:path/posix";

type ClientFile = { path: string; text: string };
type MountGapResult =
  | { ok: true; mounted: string[]; gaps: { path: string; reason: string }[] }
  | { ok: false; reason: string };

const CLIENT = "src/client/";
const POMELO = CLIENT + "pomelo";
const GAP_REASON = "No Friday file or mounted Pomelo component imports this.";
const IMPORT = /^\s*import\b(?:\s*(?<bindings>[\w{}$,*\s]+?)\s*\bfrom\b)?\s*(?<quote>["'])(?<specifier>.+?)\k<quote>/;
const IMPORT_PREFIX = /^\s*import\b[\w{}$,*\s]*$/;
const LINE_TOKENS = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*|\/\*.*?(?:\*\/|(?<openComment>$))|\x60(?:\\.|[^\x60\\])*(?:\x60|(?<openTemplate>\\?$))/g;
const CLOSING_TOKEN = { comment: /\*\//, template: /^(?:\\.|[^\x60\\])*\x60/ };
const INLINE_TYPE = /^type\s+(?:[\w$]+\s+as\s+[\w$]+|(?!as\s)[\w$]+)$/;

function typeOnly(bindings: string): boolean {
  if (/^type\s+[^\s,]/.test(bindings)) return true;
  const named = /^\{(.*)\}$/.exec(bindings);
  if (!named) return false;
  const names = named[1].split(",").map((name) => name.trim()).filter(Boolean);
  return names.length > 0 && names.every((name) => INLINE_TYPE.test(name));
}

function* importedPaths(source: string): Iterable<string> {
  let open: keyof typeof CLOSING_TOKEN | undefined;
  let statement = "";

  for (let line of source.split(/\r?\n/)) {
    if (open) {
      const close = CLOSING_TOKEN[open].exec(line);
      if (!close) continue;
      line = line.slice(close.index + close[0].length);
      open = undefined;
    }

    // Keep module strings intact and mask comments and template examples.
    const code = line.replace(LINE_TOKENS, (token, openComment?: string, openTemplate?: string) => {
      if (openComment !== undefined) open = "comment";
      if (openTemplate !== undefined) open = "template";
      if (token.startsWith("/")) return " ";
      return token.startsWith("\x60") ? "#" : token;
    });

    if (/^\s*import\b/.test(code)) statement = code;
    else if (statement) statement += " " + code;

    const match = IMPORT.exec(statement);
    if (!match && IMPORT_PREFIX.test(statement)) continue;
    statement = "";
    if (match?.groups && !typeOnly(match.groups.bindings?.trim() ?? "")) {
      yield match.groups.specifier;
    }
  }
}

function resolveImport(path: string, specifier: string, files: ReadonlyMap<string, string>): string | undefined {
  if (!/^\.{1,2}\//.test(specifier)) return;
  const target = posix.join(posix.dirname(path), specifier);
  if (!target.startsWith(POMELO + "/")) return;
  if (/\.tsx?$/.test(target)) return files.has(target) ? target : undefined;
  const stem = target.replace(/\.js$/, "");
  return [stem + ".ts", stem + ".tsx", stem + ".js"].find((candidate) => files.has(candidate));
}

/** Report import reachability for TSX files directly under src/client/pomelo. */
export function mountGaps(files: readonly ClientFile[]): MountGapResult {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, reason: "Provide a non-empty array of client files." };
  }

  const pending: ClientFile[] = [];
  const pomelo = new Map<string, string>();
  for (const file of files) {
    if (typeof file?.path !== "string" || typeof file.text !== "string") {
      return { ok: false, reason: "Each file needs a path and text." };
    }
    const path = posix.normalize(file.path);
    if (!path.startsWith(CLIENT) || !/\.(?:tsx?|js)$/.test(path)) continue;
    if (/\.(?:d|test|spec)\.(?:tsx?|js)$/.test(path)) continue;
    if (path.startsWith(POMELO + "/")) pomelo.set(path, file.text);
    else pending.push({ path, text: file.text });
  }

  const reached = new Set<string>();
  while (pending.length > 0) {
    const { path, text } = pending.pop()!;
    for (const specifier of importedPaths(text)) {
      const target = resolveImport(path, specifier, pomelo);
      if (!target || reached.has(target)) continue;
      reached.add(target);
      pending.push({ path: target, text: pomelo.get(target)! });
    }
  }

  const components = [...pomelo.keys()]
    .filter((path) => posix.dirname(path) === POMELO && path.endsWith(".tsx"))
    .sort();
  const mounted: string[] = [];
  const gaps: { path: string; reason: string }[] = [];
  for (const path of components) {
    if (reached.has(path)) mounted.push(path);
    else gaps.push({ path, reason: GAP_REASON });
  }
  return { ok: true, mounted, gaps };
}
