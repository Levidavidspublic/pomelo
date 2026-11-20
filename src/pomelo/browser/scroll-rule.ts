export const SCROLL_LIMITS = Object.freeze({ maxPerPage: 6, emptyInARow: 2 });

export interface ScrollObservation {
  beforeHeight: number;
  afterHeight: number;
  beforeElementCount: number;
  afterElementCount: number;
}

export interface ScrollFacts {
  scrollCount: number;
  /** Scroll observations for this page, oldest first, including the latest two when available. */
  history: readonly ScrollObservation[];
  takenOver: boolean;
}

export interface ScrollOptions {
  maxPerPage?: number;
}

export interface ScrollResult {
  verdict: "scroll" | "enough" | "hold";
  reason: string;
  /** Additional scrolls the rule currently allows on this page. */
  scrollsLeft: number;
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isHeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function invalidFacts(): ScrollResult {
  return { verdict: "hold", reason: "Hold scrolling until the page has valid scroll measurements.", scrollsLeft: 0 };
}

export function checkScroll(facts: ScrollFacts, opts?: ScrollOptions): ScrollResult {
  if (facts?.takenOver === true) {
    return { verdict: "hold", reason: "Hold scrolling while Amit controls the browser.", scrollsLeft: 0 };
  }
  if (!facts) return invalidFacts();

  const { scrollCount, history, takenOver } = facts;
  const { emptyInARow } = SCROLL_LIMITS;
  if (takenOver !== false || !isCount(scrollCount) || !Array.isArray(history)
    || history.length > scrollCount || history.length < Math.min(scrollCount, emptyInARow)) {
    return invalidFacts();
  }

  const requestedCap = opts?.maxPerPage;
  if (requestedCap !== undefined && !isCount(requestedCap)) {
    return { verdict: "hold", reason: "Hold scrolling until the page has a valid scroll limit.", scrollsLeft: 0 };
  }
  const maxPerPage = Math.min(requestedCap ?? SCROLL_LIMITS.maxPerPage, SCROLL_LIMITS.maxPerPage);

  let emptyScrolls = 0;
  for (const observation of history) {
    if (!observation) return invalidFacts();
    const { beforeHeight, afterHeight, beforeElementCount, afterElementCount } = observation;
    if (!isHeight(beforeHeight) || !isHeight(afterHeight)
      || !isCount(beforeElementCount) || !isCount(afterElementCount)) {
      return invalidFacts();
    }

    const grew = afterHeight > beforeHeight || afterElementCount > beforeElementCount;
    emptyScrolls = grew ? 0 : emptyScrolls + 1;
  }

  if (scrollCount >= maxPerPage) {
    return {
      verdict: "enough",
      reason: `Enough scrolling because ${scrollCount} scrolls reached the limit of ${maxPerPage} without finding the end of the page.`,
      scrollsLeft: 0,
    };
  }
  if (emptyScrolls >= emptyInARow) {
    return {
      verdict: "enough",
      reason: `Enough scrolling because the last ${emptyInARow} scrolls brought nothing new.`,
      scrollsLeft: 0,
    };
  }

  return {
    verdict: "scroll",
    reason: "Scroll once more to check for additional content.",
    scrollsLeft: maxPerPage - scrollCount,
  };
}
