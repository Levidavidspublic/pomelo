import { hideSecrets } from "../secrets.js";

const KINDS = ["diagram", "artifact", "image", "widget"] as const;
export type PomeloCardKind = (typeof KINDS)[number];

const INPUT_TYPES = ["text", "number", "toggle", "select"] as const;
type InputType = (typeof INPUT_TYPES)[number];
type WidgetBody = { label: string } & (
  | { type: Exclude<InputType, "select"> }
  | { type: "select"; options: string[] }
);

export type PomeloCard = { title: string; note?: string; version: number } & (
  | { kind: "diagram"; body: string }
  | { kind: "artifact"; body: string }
  | { kind: "image"; src: string }
  | { kind: "widget"; body: WidgetBody }
);

/** Use this value on the iframe that renders the artifact's HTML. */
export const ARTIFACT_SANDBOX = "allow-scripts";

const MAX_IMAGE_SRC = 1024 * 1024;
const MAX_SESSION_PATH = 600;
const PICTURE_FILE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const IMAGE_DATA_HEADER = /^data:image\/[a-z0-9][a-z0-9.+-]*(?:;[a-z0-9-]+=[a-z0-9._-]+)*(;base64)?,/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return hideSecrets(value.replace(/\s+/g, " ").trim()).text.slice(0, limit).trimEnd();
}

function cleanImage(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_IMAGE_SRC) return;
  const src = value.trim();
  // Redaction would change the file reference or corrupt the image data.
  if (hideSecrets(src).hidden) return;

  const header = IMAGE_DATA_HEADER.exec(src);
  if (header) {
    const data = src.slice(header[0].length);
    if (header[1]) {
      const remainder = data.length % 4;
      if (/^[a-z0-9+/]+={0,2}$/i.test(data) && (data.endsWith("=") ? remainder === 0 : remainder !== 1)) return src;
    } else if (data && !/[\s#\x00-\x1f\x7f]|%(?![a-f0-9]{2})/i.test(data)) {
      return src;
    }
    return;
  }

  // Resolve relative references through the session's file handler, which checks file access.
  if (src.length <= MAX_SESSION_PATH && PICTURE_FILE.test(src) &&
      !src.startsWith("/") && !src.startsWith("~/") && !/[\\:%?#\x00-\x1f\x7f]/.test(src) && !src.split("/").includes("..")) {
    return src;
  }
}

function cleanWidget(value: unknown): { body: WidgetBody } | { error: string } {
  const invalidType = { error: `Choose the widget input type from ${INPUT_TYPES.join(", ")}.` };
  if (!isRecord(value)) return invalidType;
  const type = INPUT_TYPES.find((input) => input === value.type);
  if (!type) return invalidType;
  const label = text(value.label, 60);
  if (!label) return { error: "Give the widget input a label." };
  if (type !== "select") return { body: { type, label } };

  const { options } = value;
  const error = "Give the select widget two to twelve distinct text options.";
  if (!Array.isArray(options) || options.length < 2 || options.length > 12) return { error };
  const labels = Array.from(options, (option) => text(option, 60));
  if (labels.some((option) => !option) || new Set(labels).size !== labels.length) return { error };
  return { body: { type, label, options: labels } };
}

/** Clean the agent's card arguments before they reach a renderer or a session log. */
export function cleanPomeloCard(args: unknown): { card: PomeloCard } | { error: string } {
  const invalidKind = { error: `Choose a card kind from ${KINDS.join(", ")}.` };
  if (!isRecord(args)) return invalidKind;
  const kind = KINDS.find((entry) => entry === args.kind);
  if (!kind) return invalidKind;
  const title = text(args.title, 120);
  if (!title) return { error: "Give the card a title in a few words." };
  const note = text(args.note, 300);
  const version = args.version === undefined ? 1 : args.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    return { error: "Use a positive whole number for the card version." };
  }
  const card = { title, version, ...(note ? { note } : {}) };

  if (kind === "image") {
    const src = cleanImage(args.src);
    if (!src) return { error: "Use an image data URL or a picture path relative to the session folder for the image source." };
    return { card: { ...card, kind, src } };
  }
  if (kind === "widget") {
    const widget = cleanWidget(args.body);
    if ("error" in widget) return widget;
    return { card: { ...card, kind, body: widget.body } };
  }

  const source = args.body;
  if (typeof source !== "string" || !source.trim()) {
    return { error: kind === "diagram" ? "Give the diagram a body with Mermaid source." : "Give the artifact a body with HTML." };
  }
  const limit = kind === "diagram" ? 16 : 128;
  const maxBytes = limit * 1024;
  const tooLarge = { error: `Keep the ${kind} body to ${limit} KiB or less.` };
  if (Buffer.byteLength(source) > maxBytes) return tooLarge;
  const body = hideSecrets(source).text;
  if (Buffer.byteLength(body) > maxBytes) return tooLarge;
  return { card: { ...card, kind, body } };
}
