export interface TargetAction {
  action: "click" | "type";
  ref: number;
  readId?: string;
  pageUrl: string;
  frame: string;
}

export interface MaskedPageRead {
  readId: string;
  pageUrl: string;
  frame: string;
  elements: readonly {
    ref: number;
    /** True when the read marks this as a masked secret field. */
    masked?: boolean;
  }[];
}

export interface TargetFreshResult {
  decision: "go" | "reread" | "refuse";
  reason: string;
}

/** Checks an action against the caller's newest masked read. Refs are scoped to that read and frame. */
export function checkTargetFresh(action: TargetAction, latestRead: MaskedPageRead): TargetFreshResult {
  if (!action.readId?.trim()) {
    return { decision: "refuse", reason: "The action needs a masked read ID." };
  }

  let expectedPage: URL;
  let readPage: URL;
  try {
    expectedPage = new URL(action.pageUrl);
    readPage = new URL(latestRead.pageUrl);
  } catch {
    return { decision: "refuse", reason: "The page address is invalid." };
  }

  // URL serializes every opaque origin as "null", so that value cannot establish a match.
  if (expectedPage.origin === "null" || readPage.origin === "null") {
    return { decision: "refuse", reason: "The page address needs a comparable origin." };
  }

  if (
    action.readId !== latestRead.readId ||
    expectedPage.origin !== readPage.origin ||
    expectedPage.pathname !== readPage.pathname ||
    action.frame !== latestRead.frame
  ) {
    return { decision: "reread", reason: "Take a fresh masked read for the current page and frame." };
  }

  const target = latestRead.elements.find((element) => element.ref === action.ref);
  if (!target) {
    return { decision: "reread", reason: "Take a fresh masked read to locate the target." };
  }
  if (action.action === "type" && target.masked === true) {
    return { decision: "refuse", reason: "Use the broker to fill the masked secret field." };
  }
  return { decision: "go", reason: "The target is present in the newest masked read." };
}
