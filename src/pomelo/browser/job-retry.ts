type HeldJobReason = "vps_unreachable" | "vault_locked" | "captcha" | "import_partial";
type PendingStep = "read" | "navigate" | "fill" | "import";

type HeldJobInput = {
  reason: HeldJobReason;
  tries: number;
  lastTriedAt: number;
  now: number;
  pendingStep: PendingStep;
  amitPressedRetry: boolean;
};

type HeldJobDecision = {
  action: "retry" | "wait" | "ask_amit";
  retryAt?: number;
  why: string;
};

export const RETRY_WAITS_MS = Object.freeze([30_000, 120_000, 600_000] as const);

// Times are in milliseconds and tries counts the retries already used.
export function heldJobNext(input: HeldJobInput): HeldJobDecision {
  const { reason, tries, lastTriedAt, now, pendingStep } = input;
  const pressedRetry = input.amitPressedRetry === true;

  if (reason === "captcha") {
    return { action: "ask_amit", why: "Amit needs to handle the CAPTCHA." };
  }

  if ((pendingStep === "fill" || pendingStep === "import") && !pressedRetry) {
    return { action: "ask_amit", why: "This step needs fresh approval from Amit before it can run again." };
  }

  if (reason === "import_partial") {
    return { action: "ask_amit", why: "Amit needs to review the partial import." };
  }

  if (!Number.isInteger(tries) || tries < 0) {
    return { action: "ask_amit", why: "Amit needs to review the job because its retry count is invalid." };
  }

  if (reason === "vault_locked") {
    // The retry press is Amit's signal that he has unlocked 1Password.
    if (pressedRetry) return { action: "retry", retryAt: now, why: "Amit requested a retry for the locked vault." };
    return { action: "wait", why: "The job is waiting for Amit to unlock 1Password and press Retry." };
  }

  if (reason === "vps_unreachable") {
    if (pressedRetry) return { action: "retry", retryAt: now, why: "Amit requested an immediate retry." };

    const delay = RETRY_WAITS_MS[tries];
    if (delay === undefined) {
      return { action: "ask_amit", why: "The job has used all automatic retries for the VPS connection." };
    }

    const retryAt = lastTriedAt + delay;
    if (now < retryAt) return { action: "wait", retryAt, why: "The job is waiting for the next VPS retry." };
    return { action: "retry", retryAt, why: "The job is due to retry the VPS connection." };
  }

  return { action: "ask_amit", why: "Amit needs to review why the job is on hold." };
}
