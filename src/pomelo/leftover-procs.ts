import { posix } from "node:path";

export interface LeftoverProcsOptions {
  readonly workerRoot: string;
  readonly liveWorkerDirs: readonly string[] | ReadonlySet<string>;
  readonly protectedPids: readonly number[] | ReadonlySet<number>;
  readonly minAgeSeconds: number;
}

export interface LeftoverProcess {
  pid: number;
  kind: "test" | "browser" | "redis" | "other";
  workerDir: string;
  ageSeconds: number;
  reason: string;
}

function unquote(arg: string): string {
  return arg.replace(/^("|')(.*)\1$/, "$2");
}

function processKind(args: readonly string[]): LeftoverProcess["kind"] {
  const command = posix.basename(unquote(args[0] ?? ""));
  if (command === "redis-server") return "redis";
  if (/^(?:chrome|chromium|chromium-browser|google-chrome(?:-stable)?|(?:chrome-)?headless[_-]shell|firefox|MiniBrowser)$/.test(command)) {
    return "browser";
  }
  if (command === "npm" && args[1] === "test") return "test";
  if (/^(?:node|nodejs|tsx)$/.test(command) && args.slice(1).some((arg) =>
    arg === "--test" || /(?:^|\/)scripts\/test\.mjs$|\.test\.[cm]?[jt]sx?$/.test(unquote(arg)),
  )) return "test";
  return "other";
}

function findWorkerDir(args: readonly string[], rootPrefix: string): string | undefined {
  let workerDir: string | undefined;
  for (const arg of args) {
    const path = unquote(arg.replace(/^--?[\w-]+=/, ""));
    if (!posix.isAbsolute(path)) continue;
    const normalized = posix.normalize(path);
    if (!normalized.startsWith(rootPrefix)) continue;
    const folder = normalized.slice(rootPrefix.length).split("/", 1)[0];
    if (!folder) continue;
    const candidate = rootPrefix + folder;
    if (workerDir && workerDir !== candidate) return undefined;
    workerDir = candidate;
  }
  return workerDir;
}

/** Find processes older than the limit whose arguments identify one inactive worker folder in a ps snapshot. */
export function leftoverProcs(psText: string, opts: LeftoverProcsOptions): {
  leftovers: LeftoverProcess[];
  unreadableLines: number;
} {
  const rows: { pid: number; ageSeconds: number; commandLine: string }[] = [];
  const childrenByParent = new Map<number, number[]>();
  let unreadableLines = 0;
  for (const line of psText.split("\n")) {
    const row = line.trim();
    if (!row || /^PID\s+PPID\s+(?:ELAPSED|ETIMES)\s+(?:COMMAND|ARGS)$/.test(row)) continue;
    const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(row);
    if (!match) {
      unreadableLines++;
      continue;
    }
    const [, pidText, parentText, ageText, commandLine] = match;
    const [pid, ppid, ageSeconds] = [pidText, parentText, ageText].map(Number);
    if (pid === 0 || ![pid, ppid, ageSeconds].every(Number.isSafeInteger)) {
      unreadableLines++;
      continue;
    }
    rows.push({ pid, ageSeconds, commandLine });
    const siblings = childrenByParent.get(ppid);
    if (siblings) siblings.push(pid);
    else childrenByParent.set(ppid, [pid]);
  }

  // Keep the whole protected process tree, including children with no worker path of their own.
  const protectedPids = new Set(opts.protectedPids);
  for (const pid of protectedPids) {
    for (const child of childrenByParent.get(pid) ?? []) protectedPids.add(child);
  }

  const leftovers: LeftoverProcess[] = [];
  if (!posix.isAbsolute(opts.workerRoot)) return { leftovers, unreadableLines };
  const rootPrefix = posix.normalize(opts.workerRoot).replace(/\/$/, "") + "/";
  const liveWorkerDirs = new Set(Array.from(opts.liveWorkerDirs, (dir) => posix.normalize(dir).replace(/\/$/, "")));
  for (const { pid, ageSeconds, commandLine } of rows) {
    if (protectedPids.has(pid) || !(ageSeconds > opts.minAgeSeconds)) continue;
    // ps flattens argv. Use visible absolute paths, including option values and literal quoted paths.
    const args = Array.from(commandLine.matchAll(/(?:^|\s)((?:[^\s"']|"[^"]*"|'[^']*')+)(?=\s|$)/g), (match) => match[1]);
    const workerDir = findWorkerDir(args, rootPrefix);
    if (!workerDir || liveWorkerDirs.has(workerDir)) continue;
    leftovers.push({
      pid,
      kind: processKind(args),
      workerDir,
      ageSeconds,
      reason: "The process exceeded the age limit and its folder has no live worker.",
    });
  }

  return { leftovers: leftovers.sort((a, b) => a.pid - b.pid), unreadableLines };
}
