/** The top frame is at depth zero. */
export const MAX_FRAME_READ_DEPTH = 4;
/** The count includes the top frame and counts other frames in input order. */
export const MAX_FRAME_READ_COUNT = 32;

export interface FrameReadInput {
  /** The browser's frame identifier, unique within this page. */
  id: string;
  /** The top frame has a null parent. */
  parentId: string | null;
  url: string;
  hasSecretField: boolean;
  textLength: number;
}

export interface FrameReadDecision {
  id: string;
  decision: "read" | "skip";
  reason: string;
  marker?: string;
}

function webAddress(address: string): URL | null {
  try {
    const url = new URL(address);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function skipFrame(frame: FrameReadInput, reason: string, marker?: string): FrameReadDecision {
  const result: FrameReadDecision = {
    id: frame.id,
    decision: "skip",
    reason: frame.hasSecretField ? "holds a sign-in or payment field" : reason,
  };
  if (marker !== undefined) result.marker = marker;
  return result;
}

/** Plan reads from browser frame metadata. Scope contains hostnames without ports. */
export function planFrameRead(
  page: string,
  frames: readonly FrameReadInput[],
  scope: readonly string[],
): FrameReadDecision[] {
  const pageOrigin = webAddress(page)?.origin;
  const scopeHosts = scope.map(normalizeHostname).filter(Boolean);
  const topIndex = frames.findIndex((frame) => frame.parentId === null);
  const frameIndices = new Map(frames.map(({ id }, index) => [id, index]));

  // Reserve a place for the top frame even if it arrives after its children.
  let childCount = 0;
  const decisions = frames.map((frame, index): FrameReadDecision => {
    if (index === topIndex) return { id: frame.id, decision: "read", reason: "top frame" };

    childCount++;
    const url = webAddress(frame.url);
    if (!url) return skipFrame(frame, "embedded frame address", "[embedded frame left out]");

    const hostname = normalizeHostname(url.hostname);
    const sameOrigin = url.origin === pageOrigin;
    const scopedHttps = url.protocol === "https:" && scopeHosts.some((host) =>
      hostname === host || hostname.endsWith(`.${host}`));
    if (!sameOrigin && !scopedHttps) {
      return skipFrame(frame, "outside the page origin and HTTPS site scope", `[frame from ${url.hostname} left out]`);
    }
    if (childCount >= MAX_FRAME_READ_COUNT) return skipFrame(frame, "frame count limit reached");

    return { id: frame.id, decision: "read", reason: sameOrigin ? "same origin as the page" : "HTTPS site in job scope" };
  });

  // Check the entire eligible parent chain against the first pass, regardless of input order.
  return decisions.map((decision, index) => {
    if (index === topIndex || decision.decision === "skip") return decision;

    const frame = frames[index];
    const visited = new Set([index]);
    let current = frame;
    for (let depth = 1; depth <= MAX_FRAME_READ_DEPTH; depth++) {
      const parentIndex = current.parentId === null ? undefined : frameIndices.get(current.parentId);
      if (parentIndex === undefined) return skipFrame(frame, "parent frame is missing");
      if (visited.has(parentIndex)) return skipFrame(frame, "parent frame links form a loop");
      if (decisions[parentIndex].decision === "skip") return skipFrame(frame, "parent frame was left out");
      if (parentIndex === topIndex) return decision;

      visited.add(parentIndex);
      current = frames[parentIndex];
    }
    return skipFrame(frame, "frame depth limit reached");
  });
}
