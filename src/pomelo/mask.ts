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
  const queryUrl = new URL("https://example.invalid");
  for (const value of new Set(known)) {
    if (!/^.{2}/su.test(value) || value.trim() === "") continue;
    patterns.push({ length: value.length, pattern: escapePattern(value) });
    const urlValue = toUSVString(value);
    const formValue = new URLSearchParams([["", value]]).toString().slice(1);
    // A browser URL's query keeps characters such as + and @ that form and component encoding escape.
    queryUrl.search = `?=${urlValue}`;
    const browserValue = queryUrl.search.slice(2);
    for (const encoded of new Set([encodeURIComponent(urlValue), encodeURI(urlValue), formValue, browserValue])) {
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
  return (text) => {
    let masked = "";
    let maskedThrough = 0;
    for (let match = secrets.exec(text); match; match = secrets.exec(text)) {
      if (match[0] === MASK || match[0] === HIDDEN) continue;
      if (match.index >= maskedThrough) masked += text.slice(maskedThrough, match.index) + MASK;
      maskedThrough = Math.max(maskedThrough, secrets.lastIndex);
      // A value starting inside this match may extend past its end.
      secrets.lastIndex = match.index + 1;
    }
    return hideSecrets(masked + text.slice(maskedThrough)).text;
  };
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
      const { box, value } = field;
      if (!box) return [];
      const { x, y, width, height } = box;
      if (![x, y, width, height].every(Number.isFinite)) return [];
      const maskedValue = typeof value === "string" ? redact(value) : "";
      return isSecretField(field) || maskedValue.includes(MASK) || maskedValue.includes(HIDDEN) ? [{ x, y, width, height }] : [];
    }) ?? [];
    masked.content = content.map((block) => {
      if (!block || typeof block !== "object" || !("type" in block) || block.type !== "image") return walkTree(block, redact);

      const { type, data, ...metadata } = block as { type: "image"; data?: unknown };
      // The later pixel pass handles base64 payloads.
      const maskedData = typeof data === "string" ? data : walkTree(data, redact);
      return { type, ...walkTree(metadata, redact), data: maskedData, needsRegionMask: true, fieldBoxes };
    });
  }
  return masked;
}
