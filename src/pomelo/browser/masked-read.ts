import { MASK, maskField, maskText } from "../mask.js";
import { planFrameRead, type FrameReadInput } from "./frame-read.js";
import { dropHiddenText, type HiddenTextElement, type HiddenTextWindow } from "./hidden-text.js";
import { pageReadRelease, type PageMaskPass, type PageRead } from "./page-read-release.js";
import { trimPageRead, type PageReadLine } from "./read-budget.js";

interface RawReadElement extends HiddenTextElement {
  role: string;
  /** Field values are collected separately from the visible text or label. */
  field?: Readonly<Parameters<typeof maskField>[0] & { value?: string }>;
}

interface RawReadFrame extends FrameReadInput {
  elements: readonly RawReadElement[];
  viewport?: HiddenTextWindow;
}

export interface MaskedPageReadInput {
  /** Collector-owned page and frame identifiers from this capture. */
  scope: Readonly<Pick<PageRead, "jobId" | "pageId" | "navigationId" | "frameIds" | "url" | "readAt">>;
  frames: readonly RawReadFrame[];
  siteScope: readonly string[];
  knownSecrets: readonly string[];
  now: number;
  maxChars?: number;
}

export type MaskedPageReadResult =
  | { read: PageRead; maskPass: PageMaskPass }
  | { reason: string };

const REFUSAL_REASON = "Page read could not be masked safely.";

function visibleElements(frame: RawReadFrame): RawReadElement[] {
  const { elements, viewport } = frame;
  const { kept, dropped } = dropHiddenText(elements, viewport);
  // Both lists refer to the original indices, including the positions of omission markers.
  const visible: RawReadElement[] = [];
  for (const { index } of kept) visible[index] = elements[index];
  for (const { index, marker, maskMarkers = [] } of dropped) {
    visible[index] = { role: "note", text: [marker, ...maskMarkers].join(" ") };
  }
  return visible;
}

/** Prepare one page read and stamp it only after all four rules succeed. */
export function maskedPageRead(input: MaskedPageReadInput): MaskedPageReadResult {
  try {
    const { scope, frames, siteScope, knownSecrets, now, maxChars } = input;
    const { jobId, pageId, navigationId, url, readAt } = scope;
    const decisions = planFrameRead(url, frames, siteScope);
    const capturedIds = new Set(decisions.map(({ id }) => id));
    const frameIds = [...scope.frameIds];
    const scopedIds = new Set(frameIds);
    if (capturedIds.size !== frames.length || scopedIds.size !== frameIds.length ||
      capturedIds.size !== scopedIds.size || frameIds.some((id) => !capturedIds.has(id))) {
      return { reason: REFUSAL_REASON };
    }

    const elements = decisions.flatMap(({ decision, marker }, index) => {
      if (decision === "read") return visibleElements(frames[index]);
      return marker ? [{ role: "note", text: marker }] : [];
    });

    let hasSecretFields = frames.some((frame) => frame.hasSecretField);
    const lines: PageReadLine[] = elements.map(({ role, text, field }) => {
      const maskedField = field && maskField(field);
      const secret = maskedField !== field;
      if (secret) hasSecretFields = true;
      const line = [text, maskedField?.value].filter(Boolean).join(" ");
      return { role: maskText(role, knownSecrets), text: maskText(line, knownSecrets), secret };
    });
    const maskedUrl = maskText(url, knownSecrets);
    const budget = trimPageRead({ lines, maxChars, maskMarker: MASK });
    if ("ok" in budget) return { reason: REFUSAL_REASON };

    const binding = { jobId, pageId, navigationId, frameIds };
    const read: PageRead = {
      ...binding, url: maskedUrl, readAt, hasSecretFields, text: budget.lines.map(({ text }) => text).join("\n"),
    };
    const maskPass: PageMaskPass = { ...binding, maskedAt: now, knownCount: knownSecrets.length };
    if (!pageReadRelease(read, maskPass, now).release) return { reason: REFUSAL_REASON };
    return { read, maskPass };
  } catch {
    return { reason: REFUSAL_REASON };
  }
}
