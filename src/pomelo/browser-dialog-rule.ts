import { hideSecrets } from "../secrets.js";

export interface DialogEvent {
  type?: string;
  /** The message from the browser mask layer. */
  message?: string;
  origin?: string;
}

export interface DialogContext {
  step?: "fill" | "submit" | "import" | "other";
  /** Whether Amit approved the current step. */
  approved?: boolean;
  /** Whether the current step has already used its one dialog acceptance. */
  acceptedDialog?: boolean;
}

export interface DialogDecision {
  action: "dismiss" | "accept" | "hold";
  reason: string;
  logText: string;
  promptText: null;
}

const CREDENTIAL_REQUEST = /\b(?:passwords?|passcodes?|(?:verification|security|one[\s-]+time)[\s-]+codes?|otp|(?:enter|provide|type)\s+(?:(?:the|your|a)\s+)?codes?)\b/iu;
const HEBREW_CREDENTIAL_REQUEST = /סיסמ(?:ה|א|ות|ת)|קוד[\s־-]+ה?(?:אימות|אבטחה|חד[\s־-]+פעמי)/u;

/** The caller tracks acceptance for the current step before acting on another dialog. */
export function decideDialog(
  event?: DialogEvent | null,
  context?: DialogContext | null,
): DialogDecision {
  const message = event?.message;
  const logText = typeof message === "string" ? hideSecrets(message).text.slice(0, 200) : "";
  const decision = (action: DialogDecision["action"], reason: string): DialogDecision => ({
    action,
    reason,
    logText,
    promptText: null,
  });

  const step = context?.step;
  if (
    typeof message !== "string" || typeof event?.origin !== "string" || event.origin.trim() === "" ||
    typeof event.type !== "string" ||
    (step !== "fill" && step !== "submit" && step !== "import" && step !== "other") ||
    typeof context?.approved !== "boolean" || typeof context.acceptedDialog !== "boolean"
  ) {
    return decision("hold", "missing-dialog-fields");
  }

  if (CREDENTIAL_REQUEST.test(message) || HEBREW_CREDENTIAL_REQUEST.test(message)) {
    return decision("hold", "credential-request");
  }

  switch (event.type) {
    case "alert":
      return decision("dismiss", "alert");
    case "prompt":
      if (step === "fill") return decision("hold", "prompt-during-fill");
      return decision("dismiss", "prompt");
    case "confirm":
    case "beforeunload":
      if (!context.approved || step === "other") {
        if (event.type === "beforeunload") return decision("dismiss", "stay-on-page");
        return decision("hold", context.approved ? "step-not-eligible" : "step-not-approved");
      }
      if (context.acceptedDialog) return decision("hold", "dialog-already-accepted");
      return decision("accept", "step-approved");
    default:
      return decision("hold", "unknown-dialog-type");
  }
}
