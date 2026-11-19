const HOLD_LABELS = new Set(["do-not-merge", "hold", "needs-amit", "wip"]);
const REVIEW_STATES = ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"] as const;
const SUBMISSION_TIME = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export type PrHoldReviewState = (typeof REVIEW_STATES)[number];

export interface PrHoldReview {
  reviewer: string;
  state: PrHoldReviewState;
  /** An ISO timestamp with a time zone and up to millisecond precision. */
  submittedAt: string;
}

export interface PrHoldInput {
  draft: boolean;
  labels: readonly string[];
  reviews: readonly PrHoldReview[];
}

export interface PrHoldResult {
  mayAutoMerge: boolean;
  reasons: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function submissionTime(value: unknown): number {
  if (typeof value !== "string" || !SUBMISSION_TIME.test(value)) return NaN;
  const date = value.slice(0, 10);
  // Date.parse can roll a nonexistent calendar day into the next month.
  const day = new Date(`${date}T00:00:00Z`).getUTCDate();
  return day === Number(date.slice(-2)) ? Date.parse(value) : NaN;
}

/** Check the hold signals in a PR snapshot. Missing or unrecognized data holds the PR. */
export function checkPrHold(pr: unknown): PrHoldResult {
  if (!isRecord(pr)) return { mayAutoMerge: false, reasons: ["The PR details are missing or invalid."] };

  const reasons: string[] = [];
  if (typeof pr.draft !== "boolean") {
    reasons.push("The PR draft status is missing or invalid.");
  } else if (pr.draft) {
    reasons.push("The PR is a draft.");
  }

  if (!Array.isArray(pr.labels)) {
    reasons.push("The PR labels are missing or invalid.");
  } else {
    for (const label of pr.labels) {
      if (typeof label !== "string" || !label.trim()) {
        reasons.push("A PR label is missing or invalid.");
        continue;
      }
      const name = label.trim().toLowerCase().replace(/\s*-\s*/g, "-");
      if (HOLD_LABELS.has(name.replace(/\s+/g, "")) || HOLD_LABELS.has(name.replace(/\s+/g, "-"))) {
        reasons.push(`The PR has the hold label ${JSON.stringify(label.trim())}.`);
      }
    }
  }

  const reviews: { reviewer: string; state: PrHoldReviewState; time: number }[] = [];
  if (!Array.isArray(pr.reviews)) {
    reasons.push("The PR reviews are missing or invalid.");
  } else {
    for (const review of pr.reviews) {
      if (!isRecord(review) || typeof review.reviewer !== "string" || !review.reviewer.trim()) {
        reasons.push("A PR review is missing a valid reviewer.");
        continue;
      }
      const state = REVIEW_STATES.find((knownState) => knownState === review.state);
      const time = submissionTime(review.submittedAt);
      if (state === undefined || !Number.isFinite(time)) {
        reasons.push(`The review from ${JSON.stringify(review.reviewer)} has a missing or invalid state or submission time.`);
        continue;
      }
      reviews.push({ reviewer: review.reviewer, state, time });
    }
  }

  // Only a later approval or dismissal can clear a request, so requests win timestamp ties.
  reviews.sort((a, b) => a.time - b.time || Number(a.state === "CHANGES_REQUESTED") - Number(b.state === "CHANGES_REQUESTED"));
  const openRequests = new Set<string>();
  for (const { reviewer, state } of reviews) {
    if (state === "CHANGES_REQUESTED") openRequests.add(reviewer);
    if (state === "APPROVED" || state === "DISMISSED") openRequests.delete(reviewer);
  }
  for (const reviewer of openRequests) {
    reasons.push(`${JSON.stringify(reviewer)} has an open change request.`);
  }

  return { mayAutoMerge: reasons.length === 0, reasons };
}
