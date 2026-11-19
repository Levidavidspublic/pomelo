import { existsSync } from "node:fs";
import { join } from "node:path";

interface MergeGateInput {
  paused: boolean;
  required: readonly string[];
  checks: readonly { name: string; state: "passed" | "failed" | "pending" }[];
}

export function mergeDecision({ paused, required, checks }: MergeGateInput): { merge: boolean; reason: string } {
  if (paused) return { merge: false, reason: "paused" };
  if (required.length === 0) return { merge: false, reason: "no required checks" };

  for (const name of required) {
    const matches = checks.filter((check) => check.name === name);
    if (matches.length === 0) return { merge: false, reason: `required check "${name}" is missing` };

    const blocked = matches.find((check) => check.state !== "passed");
    if (blocked) return { merge: false, reason: `required check "${name}" is ${blocked.state}` };
  }

  return { merge: true, reason: "all required checks passed" };
}

export function pauseRequested(root: string): boolean {
  return existsSync(join(root, "PAUSE_AUTOMERGE"));
}
