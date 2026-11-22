import { stripVTControlCharacters } from "node:util";

type FileErrors = { file: string; errors: number; firstCode: string };
type FailureReason = "type-errors" | "unreadable" | "exit-code-mismatch" | "not-run";
type TypecheckResult = { ok: true } | {
  ok: false;
  reason: FailureReason;
  pomelo: FileErrors[];
  friday: FileErrors[];
};

const FILE_ERROR = /^(.+?)(?:\(\d+,\d+\):|:\d+:\d+ -) error (TS\d+):/;
const GLOBAL_ERROR = /^error TS\d+:/;
const NPM_HEADER = /^> @?[^@\s]+@[^@\s]+ typecheck$/;
const NPM_MISSING_SCRIPT = /^npm (?:error|ERR!) missing script\b/i;
const SHELL_MISSING_TSC = /^(?:(?:\S*sh: )(?:line \d+: |\d+: )?)?tsc: (?:command )?not found$/i;
const WINDOWS_MISSING_TSC = /^'tsc' is not recognized as an internal or external command\b/i;

export function typecheckOutput(input?: { exitCode?: unknown; output?: unknown } | null): TypecheckResult {
  const pomelo: FileErrors[] = [];
  const friday: FileErrors[] = [];
  let exitCode: unknown;
  let output: unknown;
  try {
    ({ exitCode, output } = input ?? {});
  } catch {
    return { ok: false, reason: "unreadable", pomelo, friday };
  }
  if (typeof output !== "string") return { ok: false, reason: "unreadable", pomelo, friday };

  const lines = stripVTControlCharacters(output).split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  // tsc is silent on success. npm adds a two-line script banner.
  if (exitCode === 0 && (lines.length === 0
    || (lines.length === 2 && NPM_HEADER.test(lines[0]) && lines[1] === "> tsc --noEmit"))) {
    return { ok: true };
  }

  let notRun = false;
  let globalError = false;
  const byFile = new Map<string, FileErrors>();
  for (const line of lines) {
    const diagnostic = FILE_ERROR.exec(line);
    if (!diagnostic) {
      globalError ||= GLOBAL_ERROR.test(line);
      notRun ||= NPM_MISSING_SCRIPT.test(line) || SHELL_MISSING_TSC.test(line) || WINDOWS_MISSING_TSC.test(line);
      continue;
    }
    const [, path, firstCode] = diagnostic;
    const file = path.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
    const entry = byFile.get(file);
    if (entry) entry.errors++;
    else byFile.set(file, { file, errors: 1, firstCode });
  }

  const files = [...byFile.values()].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  for (const entry of files) {
    const file = entry.file;
    const isPomelo = file.startsWith("src/pomelo/") || file.startsWith("src/client/pomelo/") || file.startsWith("test/pomelo-");
    (isPomelo ? pomelo : friday).push(entry);
  }

  if (notRun) return { ok: false, reason: "not-run", pomelo, friday };
  if (exitCode === 0 && (files.length > 0 || globalError)) {
    return { ok: false, reason: "exit-code-mismatch", pomelo, friday };
  }
  const reason = Number.isInteger(exitCode) && files.length > 0 ? "type-errors" : "unreadable";
  return { ok: false, reason, pomelo, friday };
}
