export type FillStatus = "filled" | "locked" | "denied" | "expired" | "wrong_origin" | "no_ref" | "failed";

const replyText: Record<FillStatus, string> = {
  filled: "The field was filled.",
  locked: "Unlock 1Password to continue.",
  denied: "The fill was denied.",
  expired: "The fill authorization expired.",
  wrong_origin: "The fill was blocked because the origin did not match.",
  no_ref: "The fill reference was not found.",
  failed: "The fill failed.",
};

export function fillReply({ status }: { status: FillStatus; refId?: string; origin?: string; detail?: unknown }): {
  status: FillStatus;
  text: string;
  needsApproval: boolean;
} {
  const replyStatus = typeof status === "string" && Object.hasOwn(replyText, status) ? status : "failed";
  return { status: replyStatus, text: replyText[replyStatus], needsApproval: replyStatus === "locked" };
}
