export type ApprovalRequest = {
  id: string;
  action: "fill" | "import" | "grant";
  origin: string;
  account: string;
  change: string;
  state: "pending" | "approved" | "denied";
  expiresAt?: number;
};

type ApprovalCardView = {
  headline: string;
  lines: { label: "Action" | "Site" | "Account" | "Change"; text: string }[];
  buttons: ("Approve" | "Deny" | "Edit")[];
  status: "waiting" | "approved" | "denied" | "expired";
  tone: "good" | "warn" | "bad" | "neutral";
  settled: boolean;
};

const actionText: Record<ApprovalRequest["action"], string> = {
  fill: "Fill a saved login",
  import: "Import cookies from Chrome",
  grant: "Allow fills on this site",
};

const statusText: Record<ApprovalCardView["status"], Pick<ApprovalCardView, "headline" | "tone">> = {
  waiting: { headline: "Waiting for approval", tone: "neutral" },
  approved: { headline: "Request approved", tone: "good" },
  denied: { headline: "Request denied", tone: "bad" },
  expired: { headline: "Request expired", tone: "warn" },
};

function approvalStatus({ state, expiresAt }: ApprovalRequest, now: number): ApprovalCardView["status"] {
  if (state !== "pending") return state;
  return expiresAt !== undefined && expiresAt <= now ? "expired" : "waiting";
}

function siteOrigin(input: string): string | null {
  try {
    const { origin } = new URL(input);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

function displayText(text: string): string {
  const singleLine = text.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
  return Array.from(singleLine).slice(0, 120).join("").trimEnd();
}

export function approvalCardView(request: ApprovalRequest, now: number): ApprovalCardView {
  const status = approvalStatus(request, now);
  const { headline, tone } = statusText[status];
  const settled = status !== "waiting";
  const origin = siteOrigin(request.origin);
  const buttons: ApprovalCardView["buttons"] = [];
  if (!settled) {
    if (origin) buttons.push("Approve");
    buttons.push("Deny", "Edit");
  }

  return {
    headline,
    lines: [
      { label: "Action", text: actionText[request.action] },
      { label: "Site", text: origin ?? "Unknown site" },
      { label: "Account", text: displayText(request.account) || "Not named" },
      { label: "Change", text: displayText(request.change) },
    ],
    buttons,
    status,
    tone: origin ? tone : "bad",
    settled,
  };
}
