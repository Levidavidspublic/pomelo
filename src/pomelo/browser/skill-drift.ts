import type { BrowserSkillStep } from "./skill-preflight.js";

export interface SkillDriftElement {
  role: string;
  name: string;
  fieldKind?: string;
}

export interface SkillDriftStep extends Omit<BrowserSkillStep, "kind"> {
  kind: Exclude<BrowserSkillStep["kind"], "press" | "scroll"> | "navigate" | "select" | "wait";
  target?: SkillDriftElement;
}

export interface SkillDriftPage {
  origin: string;
  elements: readonly SkillDriftElement[];
}

export type SkillDriftResult =
  | { verdict: "go"; targetIndex: number | null }
  | { verdict: "hold"; reason: "origin-changed" | "target-missing" | "target-unclear" }
  | { verdict: "refuse"; reason: "field-kind-changed" | "literal-value" | "bad-input" };

const stepKinds: readonly SkillDriftStep["kind"][] = ["navigate", "open", "click", "type", "fill", "select", "wait"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^https?:\/\/[^/?#\\@\s]+\/?$/i.test(value)) return undefined;
  return new URL(value).origin;
}

function isElement(value: unknown): value is SkillDriftElement {
  return isRecord(value) && typeof value.role === "string" && value.role.trim() !== "" &&
    typeof value.name === "string" &&
    (value.fieldKind === undefined || (typeof value.fieldKind === "string" && value.fieldKind.trim() !== ""));
}

/** Checks masked replay data and returns a zero-based index into the supplied page read, or null for a targetless step. */
export function checkSkillStep(savedStep: unknown, pageNow: unknown): SkillDriftResult {
  try {
    if (!isRecord(savedStep) || !isRecord(pageNow)) return { verdict: "refuse", reason: "bad-input" };

    const { kind, target, text, value, refId } = savedStep;
    const { elements } = pageNow;
    const savedOrigin = readOrigin(savedStep.origin);
    const pageOrigin = readOrigin(pageNow.origin);
    if (!savedOrigin || !pageOrigin || !stepKinds.some((stepKind) => stepKind === kind) ||
      !Array.isArray(elements) || (target !== undefined && !isElement(target)) ||
      (refId !== undefined && typeof refId !== "string")) {
      return { verdict: "refuse", reason: "bad-input" };
    }
    for (const element of elements) {
      if (!isElement(element)) return { verdict: "refuse", reason: "bad-input" };
    }

    if (text !== undefined || value !== undefined) return { verdict: "refuse", reason: "literal-value" };
    if (savedOrigin !== pageOrigin) return { verdict: "hold", reason: "origin-changed" };

    if (target === undefined && (kind === "navigate" || kind === "open" || kind === "wait")) {
      return { verdict: "go", targetIndex: null };
    }
    const name = target?.name.trim().toLowerCase();
    if (!target || !name) return { verdict: "hold", reason: "target-missing" };
    if (kind === "fill" && target.fieldKind === undefined) return { verdict: "refuse", reason: "bad-input" };

    let targetIndex: number | null = null;
    let fieldKindChanged = false;
    for (const [index, element] of elements.entries()) {
      if (element.role !== target.role || element.name.trim().toLowerCase() !== name) continue;
      if (element.fieldKind !== target.fieldKind) {
        fieldKindChanged = true;
        continue;
      }
      if (targetIndex !== null) return { verdict: "hold", reason: "target-unclear" };
      targetIndex = index;
    }

    if (targetIndex !== null) return { verdict: "go", targetIndex };
    if (kind === "fill" && fieldKindChanged) return { verdict: "refuse", reason: "field-kind-changed" };
    return { verdict: "hold", reason: "target-missing" };
  } catch {
    // Malformed origins or throwing properties are reported without echoing the source data.
    return { verdict: "refuse", reason: "bad-input" };
  }
}
