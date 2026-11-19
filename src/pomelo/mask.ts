import { toUSVString } from "node:util";
import { secretField, type BrowserAnswer } from "../browser-driver.js";
import { HIDDEN, hideSecrets } from "../secrets.js";

export const MASK = "••••";

interface Field {
  type?: unknown;
  name?: unknown;
  autocomplete?: unknown;
  filledByBroker?: boolean;
  value?: unknown;
}

interface FieldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BrowserAnswerWithFields = BrowserAnswer & {
  fields?: readonly (Field & { box?: FieldBox })[];
};

function isSecretField(field: Field): boolean {
  return field.filledByBroker === true || secretField({
    type: typeof field.type === "string" ? field.type : undefined,
    name: typeof field.name === "string" ? field.name : undefined,
    autocomplete: typeof field.autocomplete === "string" ? field.autocomplete : undefined,
  });
}

export function maskField<T extends Field>(field: T): T | (Omit<T, "value"> & { value: typeof MASK }) {
  return isSecretField(field) ? { ...field, value: MASK } : field;
}

const escapePattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function textMask(known: readonly string[]): (text: string) => string {
  const patterns: { length: number; pattern: string }[] = [];
  for (const value of new Set(known)) {
    if (!/^.{2}/su.test(value) || value.trim() === "") continue;
    patterns.push({ length: value.length, pattern: escapePattern(value) });
    const formValue = new URLSearchParams([["", value]]).toString().slice(1);
    for (const encoded of new Set([encodeURIComponent(toUSVString(value)), formValue])) {
      if (encoded === value) continue;
      // Hex digits in percent escapes are case-insensitive. The rest of the value stays case-sensitive.
      const pattern = escapePattern(encoded).replace(/%[0-9A-F]{2}/g, (escape) =>
        escape.replace(/[A-F]/g, (digit) => `[${digit}${digit.toLowerCase()}]`),
      );
      patterns.push({ length: encoded.length, pattern });
    }
  }
  if (patterns.length === 0) return (text) => hideSecrets(text).text;

  // Match existing placeholders first and prefer longer values at each position.
  patterns.sort((a, b) => b.length - a.length);
  const pattern = [escapePattern(MASK), escapePattern(HIDDEN), ...patterns.map((entry) => entry.pattern)].join("|");
  const secrets = new RegExp(pattern, "g");
  return (text) => hideSecrets(text.replace(secrets, (match) => match === HIDDEN ? HIDDEN : MASK)).text;
}

export function maskText(text: string, known: readonly string[]): string {
  return textMask(known)(text);
}

function walkTree<T>(node: T, redact: (text: string) => string): T {
  const copies = new WeakMap<object, object>();
  const pending: { source: object; target: object }[] = [];

  function copy(value: unknown): unknown {
    if (typeof value === "string") return redact(value);
    if (value === null || typeof value !== "object") return value;
    const existing = copies.get(value);
    if (existing) return existing;

    const target = Array.isArray(value) ? new Array(value.length) : {};
    copies.set(value, target);
    pending.push({ source: value, target });
    return target;
  }

  // Browser snapshots are structured data. Walk iteratively so page depth cannot exhaust the call stack.
  const result = copy(node) as T;
  while (pending.length > 0) {
    const { source, target } = pending.pop()!;
    const record = Array.isArray(source) ? source : maskField(source as Field);
    for (const [key, value] of Object.entries(record)) {
      const isArrayIndex = Array.isArray(source) && /^(0|[1-9]\d*)$/.test(key) && Number(key) < source.length;
      const maskedKey = isArrayIndex ? key : redact(key);
      // A page can supply an own "__proto__" key. Copy it as data.
      Object.defineProperty(target, maskedKey, { value: copy(value), enumerable: true, writable: true, configurable: true });
    }
  }
  return result;
}

export function maskTree<T>(node: T, known: readonly string[]): T {
  return walkTree(node, textMask(known));
}

/** The browser hook can attach field boxes in screenshot coordinates. Friday answers do not include them. */
export function maskAnswer(answer: BrowserAnswerWithFields, known: readonly string[]): BrowserAnswerWithFields {
  const redact = textMask(known);
  const { output, fields, content, ...rest } = answer;
  const masked: BrowserAnswerWithFields = { ...walkTree(rest, redact), output: redact(output) };
  if (fields) masked.fields = walkTree(fields, redact);
  if (content) {
    const fieldBoxes = fields?.flatMap((field) => {
      if (!field.box || (!isSecretField(field) && field.value !== MASK)) return [];
      const { x, y, width, height } = field.box;
      return [{ x, y, width, height }];
    }) ?? [];
    masked.content = content.map((block) => {
      if (!block || typeof block !== "object" || !("type" in block) || block.type !== "image") return walkTree(block, redact);

      const { type, data, ...metadata } = block as { type: "image"; data?: string };
      // Base64 is an opaque image payload for the later pixel pass.
      return { type, ...walkTree(metadata, redact), data, needsRegionMask: true, fieldBoxes };
    });
  }
  return masked;
}
