import { readRunSummary } from "./done-line.js";

interface FailedRun {
  exitCode: number | null;
  signal?: string | null;
  timedOut?: boolean;
  tail: string;
}

interface FailureCause {
  cause: "ticket" | "machine" | "unknown";
  kind: string;
  countsAsAttempt: boolean;
  reason: string;
}

const KILLED_LINE = /^[ \t]*Killed[ \t]*$|^.*: line \d+:[ \t]+\d+[ \t]+Killed\b/m;
const INSTALL_COMMAND = /^[ \t]*(?:[$>][ \t]+)?(?:npm|pnpm|yarn|bun)[ \t]+(?:ci|install|i)\b/m;
const NPM_NETWORK_ERROR = /^npm (?:ERR!|error) network\b/m;

function result(cause: FailureCause["cause"], kind: string, reason: string): FailureCause {
  return { cause, kind, countsAsAttempt: cause !== "machine", reason };
}

/** Classify a failed run using its status and captured output. Reasons use fixed text. */
export function failureCause({ exitCode, signal, timedOut, tail }: FailedRun): FailureCause {
  if (exitCode === 0) {
    return {
      cause: "unknown",
      kind: "invalid-run",
      countsAsAttempt: false,
      reason: "Exit code 0 is a successful run.",
    };
  }

  const summary = readRunSummary(tail);
  if (summary.fail) {
    return result("ticket", "test-failed", "The test summary reports a failure.");
  }

  if (timedOut || exitCode === 124 || signal === "SIGTERM") {
    return result("machine", "timed-out", "The command timed out.");
  }
  if (/JavaScript heap out of memory|\bENOMEM\b/.test(tail)) {
    return result("machine", "out-of-memory", "The command ran out of memory.");
  }
  if (signal === "SIGKILL" || exitCode === 137 || KILLED_LINE.test(tail)) {
    return result("machine", "killed", "The process was killed.");
  }
  if (/\bENOSPC\b|No space left on device/.test(tail)) {
    return result("machine", "disk-full", "The disk ran out of space.");
  }
  if (/\bEADDRINUSE\b/.test(tail)) {
    return result("machine", "port-busy", "The requested port was already in use.");
  }
  if (/\bENOTFOUND\b|\bEAI_AGAIN\b/.test(tail) ||
      (/\bECONNRESET\b/.test(tail) && (INSTALL_COMMAND.test(tail) || NPM_NETWORK_ERROR.test(tail)))) {
    return result("machine", "no-network", "A network request failed.");
  }
  if (/\bEMFILE\b/.test(tail)) {
    return result("machine", "too-many-files", "The process had too many files open.");
  }

  if (/\berror TS\d+\b/.test(tail)) {
    return result("ticket", "type-error", "TypeScript reported an error.");
  }
  if (summary.missingFiles.length > 0) {
    return result("ticket", "missing-file", "The requested test file could not be found.");
  }

  return result("unknown", "unknown", "The command failed without a recognized diagnostic.");
}
