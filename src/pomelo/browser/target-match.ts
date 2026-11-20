import type { MaskedPageRead } from "./target-fresh.js";

type TargetElement = MaskedPageRead["elements"][number] & {
  role: string;
  /** The accessible label in the masked read. */
  name: string;
  group?: string;
};

interface TargetDescription {
  role?: string;
  name: unknown;
  near?: string;
}

type TargetMatchResult =
  | { decision: "go"; ref: number; reason: string }
  | { decision: "reread"; reason: string }
  | { decision: "hold"; candidates: number[]; reason: string };

function normalizeLabel(label: unknown): string {
  return typeof label === "string" ? label.trim().replace(/\s+/gu, " ").toLowerCase().normalize("NFC") : "";
}

/** Matches whole labels in the caller's newest masked element list. */
export function matchTarget(want: TargetDescription, read: readonly TargetElement[]): TargetMatchResult {
  const name = normalizeLabel(want.name);
  if (!name) return { decision: "hold", candidates: [], reason: "A target name is required." };

  const matches = read.filter((element) =>
    (want.role === undefined || element.role === want.role) && normalizeLabel(element.name) === name,
  );
  if (matches.length === 0) {
    return { decision: "reread", reason: "Take a fresh masked read because 0 elements match the target." };
  }

  const near = normalizeLabel(want.near);
  const narrowed = matches.length > 1 && near
    ? matches.filter((element) => normalizeLabel(element.group) === near)
    : matches;
  if (narrowed.length === 1) {
    return { decision: "go", ref: narrowed[0].ref, reason: "One element matches the target." };
  }

  return {
    decision: "hold",
    candidates: matches.map((element) => element.ref),
    reason: `Hold for Amit because ${matches.length} elements match the target.`,
  };
}
