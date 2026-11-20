export type WorkerCommandKind = "test" | "typecheck" | "install" | "other";

export interface WorkerHangLimits {
  readonly warnQuietMs: number;
  readonly stopQuietMs: number;
  readonly maxRunMs: number;
}

export interface WorkerHangInput {
  readonly command: string;
  /** Times in milliseconds from the same clock. Use startedAt before the first line of output. */
  readonly startedAt: number;
  readonly lastOutputAt: number;
  readonly now: number;
  readonly limits?: Partial<WorkerHangLimits>;
}

export interface WorkerHangResult {
  verdict: "go-on" | "warn" | "stop";
  reason: string;
  quietMs: number;
  runMs: number;
}

const MINUTE_MS = 60_000;

export const DEFAULT_WORKER_HANG_LIMITS: WorkerHangLimits = Object.freeze({
  warnQuietMs: 3 * MINUTE_MS,
  stopQuietMs: 8 * MINUTE_MS,
  maxRunMs: 10 * MINUTE_MS,
});

export const DEFAULT_INSTALL_HANG_LIMITS: WorkerHangLimits = Object.freeze({
  ...DEFAULT_WORKER_HANG_LIMITS,
  warnQuietMs: 5 * MINUTE_MS,
  stopQuietMs: 9 * MINUTE_MS,
});

const COMMAND_LABELS: Record<WorkerCommandKind, string> = {
  test: "test command",
  typecheck: "typecheck command",
  install: "install command",
  other: "command",
};

function commandKind(command: string): WorkerCommandKind {
  const [executable, action, script] = command.split(/\s+/, 3);
  const tool = executable.split(/[\\/]/).at(-1);
  if (tool === "npm" || tool === "pnpm" || tool === "yarn" || tool === "bun") {
    switch (action === "run" ? script : action) {
      case "test": return "test";
      case "typecheck": return "typecheck";
      case "ci":
      case "install":
      case "i": return "install";
    }
  }
  if (tool === "tsc" || (tool === "npx" && action === "tsc")) return "typecheck";
  if (tool === "node" && (action === "--test" || action === "scripts/test.mjs")) return "test";
  return "other";
}

/** Check a worker's command from its start and most recent line of output. */
export function workerHang({ command, startedAt, lastOutputAt, now, limits }: WorkerHangInput): WorkerHangResult {
  const invalid = { verdict: "stop", quietMs: 0, runMs: 0 } as const;
  const commandText = typeof command === "string" ? command.trim() : "";
  if (!commandText) {
    return { ...invalid, reason: "The command is empty or missing." };
  }
  if (![startedAt, lastOutputAt, now].every(Number.isFinite)) {
    return { ...invalid, reason: "The start, last output, and current times must be finite numbers." };
  }
  if (now < startedAt || lastOutputAt < startedAt || lastOutputAt > now) {
    return { ...invalid, reason: "The last output time must be between the start time and the current time." };
  }

  const quietMs = now - lastOutputAt;
  const runMs = now - startedAt;
  if (!Number.isFinite(runMs)) {
    return { ...invalid, reason: "The elapsed time must be finite." };
  }

  const kind = commandKind(commandText);
  const label = COMMAND_LABELS[kind];
  const defaults = kind === "install" ? DEFAULT_INSTALL_HANG_LIMITS : DEFAULT_WORKER_HANG_LIMITS;
  const { warnQuietMs, stopQuietMs, maxRunMs } = { ...defaults, ...limits };
  const timing = { quietMs, runMs };
  if ([warnQuietMs, stopQuietMs, maxRunMs].some((limit) => !Number.isFinite(limit) || limit < 0)) {
    return { ...timing, verdict: "stop", reason: "The time limits must be finite, non-negative numbers." };
  }

  // The limit exceeded by more time was crossed first.
  const quietOverrun = quietMs - stopQuietMs;
  const runOverrun = runMs - maxRunMs;
  if (runOverrun > 0 && runOverrun > quietOverrun) {
    return { ...timing, verdict: "stop", reason: `The ${label} has run for ${runMs} ms (limit ${maxRunMs} ms).` };
  }
  if (quietOverrun > 0) {
    return { ...timing, verdict: "stop", reason: `No output from the ${label} for ${quietMs} ms (stop limit ${stopQuietMs} ms).` };
  }
  if (quietMs > warnQuietMs) {
    return { ...timing, verdict: "warn", reason: `No output from the ${label} for ${quietMs} ms (warning limit ${warnQuietMs} ms).` };
  }
  return { ...timing, verdict: "go-on", reason: "The command is within its time limits." };
}
