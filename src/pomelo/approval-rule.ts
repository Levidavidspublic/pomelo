export type ApprovalStep = Readonly<{
  action: "fill" | "import";
  origin: string;
  /** Display label for the account reference. */
  accountLabel: string;
  jobId: string;
}>;

export type ApprovalRequest = ApprovalStep & Readonly<{
  status: "pending" | "approved" | "denied" | "expired" | "used";
  expiresAt: number;
}>;

export type ApprovalReason =
  | "not-approved" | "denied" | "expired" | "already-used"
  | "action-mismatch" | "origin-mismatch" | "account-mismatch" | "job-mismatch";

type ApprovalDecision = Readonly<{
  by: "user" | "agent" | "subagent";
  approve: boolean;
}>;

type DecisionResult =
  | { ok: true; request: ApprovalRequest }
  | { ok: false; reason: "not-user" | "not-pending" | "expired"; request: ApprovalRequest };

type UseResult = { ok: true; request: ApprovalRequest } | { ok: false; reason: ApprovalReason };

function withStatus(request: ApprovalRequest, status: ApprovalRequest["status"]): ApprovalRequest {
  const { action, origin, accountLabel, jobId, expiresAt } = request;
  return { action, origin, accountLabel, jobId, status, expiresAt };
}

function hasExpired(expiresAt: number, now: number): boolean {
  return !Number.isFinite(expiresAt) || !Number.isFinite(now) || now >= expiresAt;
}

function siteOrigin(input: string): string | null {
  try {
    const { hostname, origin } = new URL(input);
    return hostname && origin !== "null" ? origin : null;
  } catch {
    return null;
  }
}

/** The caller supplies the decision actor from the authenticated request. */
export function decideApproval(request: ApprovalRequest, decision: ApprovalDecision, now: number): DecisionResult {
  const { status, expiresAt } = request;
  if (status === "expired" || (status === "pending" && hasExpired(expiresAt, now))) {
    return { ok: false, reason: "expired", request: withStatus(request, "expired") };
  }
  if (status !== "pending") {
    return { ok: false, reason: "not-pending", request: withStatus(request, status) };
  }
  if (decision.by !== "user") {
    return { ok: false, reason: "not-user", request: withStatus(request, status) };
  }
  return { ok: true, request: withStatus(request, decision.approve === true ? "approved" : "denied") };
}

/** The caller must record the returned used state atomically before dispatching the step. */
export function useApproval(request: ApprovalRequest, step: ApprovalStep, now: number): UseResult {
  if (request.status === "used") return { ok: false, reason: "already-used" };
  if (request.status === "denied") return { ok: false, reason: "denied" };
  if (request.status === "expired" || hasExpired(request.expiresAt, now)) return { ok: false, reason: "expired" };
  if (request.status !== "approved") return { ok: false, reason: "not-approved" };
  if (request.action !== step.action) return { ok: false, reason: "action-mismatch" };

  const origin = siteOrigin(request.origin);
  if (origin === null || origin !== siteOrigin(step.origin)) return { ok: false, reason: "origin-mismatch" };
  if (request.accountLabel !== step.accountLabel) return { ok: false, reason: "account-mismatch" };
  if (request.jobId !== step.jobId) return { ok: false, reason: "job-mismatch" };
  return { ok: true, request: withStatus(request, "used") };
}
