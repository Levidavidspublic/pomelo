import { hideSecrets } from "../../secrets.js";
import { MASK, maskText } from "../mask.js";

export interface RawStep {
  kind: "open" | "click" | "type" | "fill" | "read" | "wait" | "other";
  target?: unknown;
  value?: unknown;
  note?: unknown;
}

const MAX_STEP_LENGTH = 500;

export function storedStep(step: RawStep, known: readonly string[]): string {
  const value = step.kind === "fill" ? MASK : step.value;
  const text = [step.kind, step.target, value, step.note]
    .filter((field): field is string => typeof field === "string" && field.length > 0)
    .join(" ");
  const line = hideSecrets(maskText(text, known)).text.replace(/[\n\v\f\r\u0085\u2028\u2029]+/g, " ");
  return line.length > MAX_STEP_LENGTH ? `${line.slice(0, MAX_STEP_LENGTH - 1)}…` : line;
}
