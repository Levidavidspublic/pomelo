const REVIEW_STATES = ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"] as const;
const SUBMISSION_TIME = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

type ReviewState = (typeof REVIEW_STATES)[number];

export type ReviewFreshnessState = ReviewState | Lowercase<ReviewState> | "changes requested";

export interface ReviewFreshnessReview {
  reviewer: string;
  state: ReviewFreshnessState;
  commitSha: string;
  /** An ISO timestamp with a time zone and up to millisecond precision. */
  submittedAt: string;
}

export interface ReviewFreshnessInput {
  headSha: string;
  reviews: readonly ReviewFreshnessReview[];
}

export interface ReviewFreshnessResult {
  ok: boolean;
  verdict: "fresh" | "stale" | "none" | "bad-input";
  reasons: string[];
}

interface SubmittedReview {
  reviewer: string;
  state: ReviewState;
  commitSha: string;
  time: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function submissionTime(value: unknown): number {
  if (typeof value !== "string" || !SUBMISSION_TIME.test(value)) return NaN;
  const date = value.slice(0, 10);
  // Date.parse can roll an invalid calendar day into the next month.
  const day = new Date(`${date}T00:00:00Z`).getUTCDate();
  return day === Number(date.slice(-2)) ? Date.parse(value) : NaN;
}

function parseReview(review: unknown): SubmittedReview | undefined {
  if (!isRecord(review) || !isNonBlankString(review.reviewer) || !isNonBlankString(review.commitSha)) return undefined;

  const normalizedState = typeof review.state === "string" ? review.state.toUpperCase().replace(" ", "_") : undefined;
  const state = REVIEW_STATES.find((knownState) => knownState === normalizedState);
  const time = submissionTime(review.submittedAt);
  if (state === undefined || !Number.isFinite(time)) return undefined;

  return { reviewer: review.reviewer, state, commitSha: review.commitSha, time };
}

function badInput(reason: string): ReviewFreshnessResult {
  return { ok: false, verdict: "bad-input", reasons: [reason] };
}

/** Check a supplied PR snapshot for an approval on its current head. */
export function reviewFreshness(input: unknown): ReviewFreshnessResult {
  let snapshot: unknown = input;
  if (typeof input === "string") {
    try {
      snapshot = JSON.parse(input);
    } catch {
      return badInput("The PR snapshot must be valid JSON.");
    }
  }
  if (!isRecord(snapshot) || !isNonBlankString(snapshot.headSha) || !Array.isArray(snapshot.reviews)) {
    return badInput("The PR snapshot must include a head SHA and a list of reviews.");
  }

  const { headSha } = snapshot;
  const reviews: SubmittedReview[] = [];
  for (const entry of snapshot.reviews as unknown[]) {
    const review = parseReview(entry);
    if (!review) return badInput("Each review must include a valid reviewer, state, commit SHA and submission time.");
    reviews.push(review);
  }

  // On a tie, process requests after resolutions and off-head approvals after head approvals.
  reviews.sort((a, b) => a.time - b.time ||
    Number(a.state === "CHANGES_REQUESTED") - Number(b.state === "CHANGES_REQUESTED") ||
    Number(a.commitSha !== headSha) - Number(b.commitSha !== headSha) ||
    (a.commitSha < b.commitSha ? -1 : Number(a.commitSha > b.commitSha)));

  const approvals = new Map<string, string>();
  const openRequests = new Set<string>();
  for (const { reviewer, state, commitSha } of reviews) {
    switch (state) {
      case "APPROVED":
        approvals.set(reviewer, commitSha);
        openRequests.delete(reviewer);
        break;
      case "CHANGES_REQUESTED":
        approvals.delete(reviewer);
        openRequests.add(reviewer);
        break;
      case "DISMISSED":
      case "COMMENTED":
        break;
    }
  }

  if (openRequests.size > 0) {
    const reasons = [...openRequests].sort().map((reviewer) => `${JSON.stringify(reviewer)} has an open change request.`);
    return { ok: false, verdict: "none", reasons };
  }
  if ([...approvals.values()].includes(headSha)) {
    return { ok: true, verdict: "fresh", reasons: [] };
  }
  if (approvals.size > 0) {
    const reasons = [...approvals].map(([reviewer, commitSha]) =>
      `${JSON.stringify(reviewer)} approved commit ${commitSha}. The PR head is ${headSha}.`,
    ).sort();
    return { ok: false, verdict: "stale", reasons };
  }
  return { ok: false, verdict: "none", reasons: ["The PR has no approval."] };
}
