type ReviewDecision = "approved" | "changes_requested";

export type CodeRabbitResult = { openComments: number } & (
  | { status: ReviewDecision; reviewedCommitId: string }
  | { status: "pending" | "unavailable" | "off"; reviewedCommitId?: string }
);

export interface FallbackReview {
  reviewer: string;
  status: ReviewDecision;
  reviewedCommitId: string;
}

export interface ReviewGateInput {
  headCommitId: string;
  codeRabbit: CodeRabbitResult;
  fallback?: FallbackReview;
}

export type ReviewGateReason =
  | "coderabbit_approved"
  | "fallback_approved"
  | "stale_review"
  | "open_comments"
  | "changes_requested"
  | "coderabbit_pending"
  | "no_review"
  | "bad_input";

export interface ReviewGateResult {
  verdict: "pass" | "wait" | "fail";
  reason: ReviewGateReason;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function reviewGate(input: ReviewGateInput): ReviewGateResult {
  const badInput = { verdict: "wait", reason: "bad_input" } as const;
  if (typeof input !== "object" || input === null) return badInput;

  const { headCommitId, codeRabbit, fallback } = input;
  if (!isNonBlankString(headCommitId) || typeof codeRabbit !== "object" || codeRabbit === null) {
    return badInput;
  }

  const { status, reviewedCommitId, openComments } = codeRabbit;
  const decided = status === "approved" || status === "changes_requested";
  const canUseFallback = status === "off" || status === "unavailable";
  if (!decided && !canUseFallback && status !== "pending") return badInput;
  if (!Number.isSafeInteger(openComments) || openComments < 0) return badInput;
  if ((decided || reviewedCommitId !== undefined) && !isNonBlankString(reviewedCommitId)) return badInput;

  // When CodeRabbit is inactive, a recorded commit matters only for outstanding comments.
  if ((!canUseFallback || openComments > 0) && reviewedCommitId !== undefined && reviewedCommitId !== headCommitId) {
    return { verdict: "wait", reason: "stale_review" };
  }
  if (openComments > 0) return { verdict: "fail", reason: "open_comments" };
  if (status === "changes_requested") return { verdict: "fail", reason: "changes_requested" };
  if (status === "approved") return { verdict: "pass", reason: "coderabbit_approved" };
  if (status === "pending") return { verdict: "wait", reason: "coderabbit_pending" };

  if (fallback === undefined) return { verdict: "wait", reason: "no_review" };
  if (typeof fallback !== "object" || fallback === null || !isNonBlankString(fallback.reviewer) ||
      !isNonBlankString(fallback.reviewedCommitId) ||
      (fallback.status !== "approved" && fallback.status !== "changes_requested")) {
    return badInput;
  }
  if (fallback.reviewedCommitId !== headCommitId) return { verdict: "wait", reason: "stale_review" };
  if (fallback.status === "changes_requested") return { verdict: "fail", reason: "changes_requested" };
  return { verdict: "pass", reason: "fallback_approved" };
}
