import { certStop, type CertStopAction, type PageSecurityFacts } from "./cert-stop.js";
import { navigationCheck, type NavigationCheckOptions } from "./nav-rule.js";
import { addressSecretCheck } from "./nav-secret.js";
import { checkRedirectChain, type RedirectChainInput } from "./redirect-chain.js";
import { siteScopeCheck, type SiteScopeInput } from "./site-scope.js";
import type { StepAnswer } from "./step-verdict.js";

export const NAV_GATE_RULES_BEFORE = Object.freeze(["address-secret", "navigation", "site-scope"] as const);
export const NAV_GATE_RULES_AFTER = Object.freeze(["redirect-chain", "certificate"] as const);

type Verdict = "go" | "hold" | "refuse";
type Rule = (typeof NAV_GATE_RULES_BEFORE | typeof NAV_GATE_RULES_AFTER)[number];

export interface NavGateBeforeInput {
  address?: unknown;
  addressSecret?: Parameters<typeof addressSecretCheck>[1];
  navigation?: NavigationCheckOptions;
  siteScope: Omit<SiteScopeInput, "toUrl">;
}

export interface NavGateAfterInput {
  redirectChain: RedirectChainInput;
  securityFacts: PageSecurityFacts;
  action: CertStopAction;
}

export interface NavGateResult {
  verdict: Verdict;
  decidedBy: Rule | null;
  reasonCode: string;
  /** A site-scope answer with `revoke-first` requires revocation before proceeding. */
  answers: StepAnswer[];
}

const CODE = {
  clear: "clear",
  invalidAddress: "invalid-address",
  addressRefused: "address-refused",
  navigationRefused: "navigation-refused",
  privateNetwork: "private-network",
  outsideScope: "outside-scope",
  invalidScope: "invalid-scope",
  revokeFirst: "revoke-first",
  certificateReview: "certificate-review",
  certificateRefused: "certificate-refused",
  ruleError: "rule-error",
} as const;

// The redirect rule already returns a closed set of reason codes.
type ReasonCode = (typeof CODE)[keyof typeof CODE] | NonNullable<ReturnType<typeof checkRedirectChain>["reason"]>;
type RuleAnswer = { answer: Verdict; reasonCode: ReasonCode };
const CLEAR: RuleAnswer = { answer: "go", reasonCode: CODE.clear };
const RULE_ERROR: RuleAnswer = { answer: "hold", reasonCode: CODE.ruleError };

function runGate<R extends Rule>(rules: readonly R[], checks: Record<R, () => RuleAnswer>): NavGateResult {
  const answers: StepAnswer[] = [];
  let firstHold: NavGateResult | undefined;

  for (const rule of rules) {
    let result: RuleAnswer;
    try {
      result = checks[rule]();
    } catch {
      result = RULE_ERROR;
    }
    const { answer, reasonCode } = result;
    answers.push({ rule, answer, reasonCode });
    if (answer === "refuse") return { verdict: answer, decidedBy: rule, reasonCode, answers };
    if (answer === "hold") firstHold ??= { verdict: answer, decidedBy: rule, reasonCode, answers };
  }
  return firstHold ?? { verdict: "go", decidedBy: null, reasonCode: CODE.clear, answers };
}

/** Checks the proposed destination before a browser job opens it. */
export function navGateBefore(input: NavGateBeforeInput): NavGateResult {
  let address: string | undefined;
  return runGate(NAV_GATE_RULES_BEFORE, {
    "address-secret": () => {
      const proposedAddress = input?.address;
      if (typeof proposedAddress !== "string") return { answer: "refuse", reasonCode: CODE.invalidAddress };
      address = proposedAddress;
      const { verdict } = addressSecretCheck(address, input.addressSecret);
      return verdict === "go" ? CLEAR : { answer: "refuse", reasonCode: CODE.addressRefused };
    },
    navigation: () => {
      if (address === undefined) return RULE_ERROR;
      const { verdict } = navigationCheck(address, input.navigation);
      if (verdict === "ask") return { answer: "hold", reasonCode: CODE.privateNetwork };
      return verdict === "go" ? CLEAR : { answer: "refuse", reasonCode: CODE.navigationRefused };
    },
    "site-scope": () => {
      if (address === undefined) return RULE_ERROR;
      const { verdict, grantAction } = siteScopeCheck({ ...input.siteScope, toUrl: address });
      const answer = verdict === "allow" ? "go" : verdict;
      if (grantAction === "revoke-first") return { answer, reasonCode: CODE.revokeFirst };
      if (answer === "hold") return { answer, reasonCode: CODE.outsideScope };
      return answer === "go" ? CLEAR : { answer, reasonCode: CODE.invalidScope };
    },
  });
}

/** Checks recorded redirects and the loaded page before the job acts on it. */
export function navGateAfter(input: NavGateAfterInput): NavGateResult {
  return runGate(NAV_GATE_RULES_AFTER, {
    "redirect-chain": () => {
      const chain = input.redirectChain;
      if (chain.hops.some((hop) => typeof hop?.address !== "string")) {
        return { answer: "refuse", reasonCode: CODE.invalidAddress };
      }
      const result = checkRedirectChain(chain);
      return result.decision === "allow" ? CLEAR : { answer: result.decision, reasonCode: result.reason };
    },
    certificate: () => {
      const facts = input.securityFacts;
      if (typeof facts?.url !== "string") return { answer: "refuse", reasonCode: CODE.invalidAddress };
      const { verdict } = certStop(facts, input.action);
      if (verdict === "go") return CLEAR;
      return { answer: verdict, reasonCode: verdict === "hold" ? CODE.certificateReview : CODE.certificateRefused };
    },
  });
}
