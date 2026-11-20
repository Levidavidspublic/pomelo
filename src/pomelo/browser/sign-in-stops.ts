import { captchaStop } from "./captcha-stop.js";
import { deviceApprovalStop } from "./device-approval-stop.js";
import { checkLockout } from "./lockout-stop.js";
import { newPasswordStop } from "./new-password-stop.js";
import { checkOneTimeCodeStop } from "./otp-stop.js";
import { detectPasskeyPrompt, type PasskeyPromptRead } from "./passkey-stop.js";
import { checkSecurityQuestion } from "./security-question-stop.js";
import { signedOutStop, type SignedOutContext } from "./signed-out-stop.js";
import type { StepAnswer } from "./step-verdict.js";
import { checkSignedInAccount, type SignedInAccountInput } from "./wrong-account-stop.js";

export interface SignInStopFacts {
  /** The account the job was started for, when specified. */
  expectedAccount?: SignedInAccountInput["expected"];
  signedOut: SignedOutContext;
}

type MaskedSignInRead = Parameters<typeof captchaStop>[0] & Parameters<typeof checkOneTimeCodeStop>[0]
  & PasskeyPromptRead & {
    /** Account marks observed on the current masked page. */
    seen?: SignedInAccountInput["seen"];
  };

interface SignInStopRule {
  rule: string;
  /** A stop flag, a broker hold, or no readable decision. */
  check: (page: MaskedSignInRead, facts: SignInStopFacts) => boolean | "broker" | undefined;
}

// Rule names also serve as the fixed reason codes for ordinary holds.
const checks = [
  {
    rule: "captcha",
    check: (page) => {
      const result = captchaStop(page);
      if (result === null) return false;
      if (result?.state === "waiting" && result.reason === "captcha") return true;
    },
  },
  { rule: "one-time-code", check: (page) => checkOneTimeCodeStop(page).stop },
  {
    rule: "passkey",
    check: (page) => {
      const { verdict } = detectPasskeyPrompt(page);
      if (verdict === "none") return false;
      if (verdict === "hold") return true;
    },
  },
  { rule: "device-approval", check: (page) => deviceApprovalStop(page).stop },
  {
    rule: "account-lock",
    check: (page) => {
      const result = checkLockout(page);
      if (result.state === "go") return false;
      if (result.state === "hold_for_amit" && result.reason !== "bad_input") return true;
    },
  },
  {
    rule: "security-question",
    check: (page) => {
      const result = checkSecurityQuestion(page);
      if (result.stop === false) return false;
      // The detector's unreadable-page hold has zero fields.
      if (result.stop === true && result.fieldCount > 0) return true;
    },
  },
  {
    rule: "signed-out",
    check: (page, facts) => {
      const result = signedOutStop(page, facts.signedOut);
      if (result.state === "go") return false;
      if (result.state === "hold_for_broker") return "broker";
      if (result.state === "hold_for_amit" && result.reason !== "bad_input") return true;
    },
  },
  {
    rule: "new-password",
    check: (page) => {
      const { action, signals } = newPasswordStop(page);
      if (action === "go") return false;
      if (action === "hold" && !signals.includes("unreadable-page")) return true;
    },
  },
  {
    rule: "wrong-account",
    check: ({ seen = [] }, { expectedAccount }) => {
      const result = checkSignedInAccount({ expected: expectedAccount, seen });
      if (result.stop === false) return false;
      if (result.stop === true && result.reason === "wrong_account") return true;
    },
  },
] as const satisfies readonly SignInStopRule[];

export const SIGN_IN_STOP_RULES = Object.freeze(checks.map(({ rule }) => rule));

/** Run every sign-in check against the same already-masked read for stepVerdict. */
export function signInStops(pageRead: unknown, facts: SignInStopFacts): StepAnswer[] {
  return checks.map(({ rule, check }): StepAnswer => {
    try {
      if (pageRead !== null && typeof pageRead === "object" && !Array.isArray(pageRead)) {
        const stop = check(pageRead as MaskedSignInRead, facts);
        if (stop === false) return { rule, answer: "go", reasonCode: "clear" };
        if (stop === true) return { rule, answer: "hold", reasonCode: rule };
        if (stop === "broker") return { rule, answer: "hold", reasonCode: "signed-out-broker" };
      }
    } catch {
      // Error details can contain page data. Emit the same fixed hold as for an unreadable decision.
    }
    return { rule, answer: "hold", reasonCode: "rule-error" };
  });
}
