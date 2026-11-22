import assert from "node:assert/strict";
import test from "node:test";
import {
  NAV_GATE_RULES_AFTER,
  NAV_GATE_RULES_BEFORE,
  navGateAfter,
  navGateBefore,
} from "../src/pomelo/browser/nav-gate.js";
import { stepVerdict } from "../src/pomelo/browser/step-verdict.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";

const address = "https://example.invalid/docs";
const canary = ["fixture", '7f"3\\a', "ÿÿÿ + 91c2e5"].join("-");
const siteScope = {
  scope: ["example.invalid"],
  fromUrl: address,
  reason: "job-step",
  hasLiveGrant: true,
};
const before = { address, siteScope };
const hop = { address, status: 200 };
const after = {
  redirectChain: { hops: [hop], startSite: "example.invalid", hasFillGrant: true },
  securityFacts: { url: address, securityState: "secure", isInterstitial: false, hasMixedActiveContent: false },
  action: "fill",
} as const;

function checkVerdict(
  result: ReturnType<typeof navGateBefore>,
  rules: readonly string[],
  verdict: "go" | "hold" | "refuse",
  decidedBy: string | null,
  answers: readonly (readonly [string, string])[],
) {
  assert.equal(result.verdict, verdict);
  assert.equal(result.decidedBy, decidedBy);
  assert.deepEqual(result.answers.map(({ rule, answer }) => [rule, answer]), answers);
  assert.equal(stepVerdict(result.answers, rules).verdict, verdict);
}

test("the before gate clears an in-scope HTTPS address in rule order", () => {
  assert.ok(Object.isFrozen(NAV_GATE_RULES_BEFORE));
  assert.deepEqual(NAV_GATE_RULES_BEFORE, ["address-secret", "navigation", "site-scope"]);
  checkVerdict(navGateBefore(before), NAV_GATE_RULES_BEFORE, "go", null, [
    ["address-secret", "go"], ["navigation", "go"], ["site-scope", "go"],
  ]);
});

test("a query canary stops the before gate without reading later rule inputs", () => {
  let laterReads = 0;
  const result = navGateBefore({
    address: `${address}?lookup=${encodeURIComponent(canary)}`,
    addressSecret: { knownSecrets: [canary] },
    get navigation() { laterReads++; return {}; },
    get siteScope() { laterReads++; return siteScope; },
  });
  assert.equal(laterReads, 0);
  const serialized = JSON.stringify(result);
  assertNoCanary(canary, { result: serialized });
  assert.ok(!serialized.includes("example.invalid"));
  assert.ok(!serialized.includes("lookup"));
  checkVerdict(result, NAV_GATE_RULES_BEFORE, "refuse", "address-secret", [["address-secret", "refuse"]]);
});

test("navigation refuses file addresses and holds private addresses", () => {
  checkVerdict(navGateBefore({ ...before, address: "file:///synthetic.txt" }),
    NAV_GATE_RULES_BEFORE, "refuse", "navigation", [["address-secret", "go"], ["navigation", "refuse"]]);

  const result = navGateBefore({ address: "https://192.168.0.10/", siteScope: { ...siteScope, scope: ["192.168.0.10"] } });
  checkVerdict(result, NAV_GATE_RULES_BEFORE, "hold", "navigation", [
    ["address-secret", "go"], ["navigation", "hold"], ["site-scope", "go"],
  ]);
});

test("leaving the site scope marks a live grant for revocation even after approval", () => {
  const target = "https://other.invalid/?lookup=ordinary";
  const result = navGateBefore({ address: target, siteScope });
  checkVerdict(result, NAV_GATE_RULES_BEFORE, "hold", "site-scope", [
    ["address-secret", "go"], ["navigation", "go"], ["site-scope", "hold"],
  ]);
  assert.equal(result.reasonCode, "revoke-first");
  assert.equal(result.answers[2].reasonCode, "revoke-first");
  const serialized = JSON.stringify(result);
  for (const text of ["example.invalid", "other.invalid", "lookup", "ordinary"]) {
    assert.ok(!serialized.includes(text));
  }

  const approved = navGateBefore({ address: target, siteScope: { ...siteScope, reason: "user-approved" } });
  checkVerdict(approved, NAV_GATE_RULES_BEFORE, "go", null, [
    ["address-secret", "go"], ["navigation", "go"], ["site-scope", "go"],
  ]);
  assert.equal(approved.answers[2].reasonCode, "revoke-first");

  const privateTarget = navGateBefore({ address: "https://192.168.0.10/", siteScope });
  checkVerdict(privateTarget, NAV_GATE_RULES_BEFORE, "hold", "navigation", [
    ["address-secret", "go"], ["navigation", "hold"], ["site-scope", "hold"],
  ]);
  assert.equal(privateTarget.answers[2].reasonCode, "revoke-first");
});

test("the after gate clears a clean chain and secure page in rule order", () => {
  assert.ok(Object.isFrozen(NAV_GATE_RULES_AFTER));
  assert.deepEqual(NAV_GATE_RULES_AFTER, ["redirect-chain", "certificate"]);
  checkVerdict(navGateAfter(after), NAV_GATE_RULES_AFTER, "go", null, [
    ["redirect-chain", "go"], ["certificate", "go"],
  ]);
});

test("redirects to private addresses hold and loops refuse before the certificate check", () => {
  const target = "https://192.168.0.10/";
  const redirected = navGateAfter({
    ...after,
    redirectChain: { ...after.redirectChain, hops: [{ ...hop, status: 302 }, { address: target, status: 200 }] },
    securityFacts: { ...after.securityFacts, url: target },
  });
  checkVerdict(redirected, NAV_GATE_RULES_AFTER, "hold", "redirect-chain", [
    ["redirect-chain", "hold"], ["certificate", "go"],
  ]);
  assert.equal(redirected.reasonCode, "private-network");
  assert.ok(!JSON.stringify(redirected).includes("192.168.0.10"));

  let certificateReads = 0;
  const loop = navGateAfter({
    ...after,
    redirectChain: { ...after.redirectChain, hops: [{ ...hop, status: 302 }, hop] },
    get securityFacts() { certificateReads++; return after.securityFacts; },
  });
  assert.equal(certificateReads, 0);
  checkVerdict(loop, NAV_GATE_RULES_AFTER, "refuse", "redirect-chain", [["redirect-chain", "refuse"]]);
  assert.equal(loop.reasonCode, "loop");
});

test("a certificate refusal for a fill wins over a redirect hold", () => {
  const target = "https://192.168.0.10/";
  const result = navGateAfter({
    ...after,
    redirectChain: { ...after.redirectChain, hops: [{ ...hop, status: 302 }, { address: target, status: 200 }] },
    securityFacts: { ...after.securityFacts, url: target, certIssues: ["expired"] },
  });
  checkVerdict(result, NAV_GATE_RULES_AFTER, "refuse", "certificate", [
    ["redirect-chain", "hold"], ["certificate", "refuse"],
  ]);
});

test("a thrown rule holds with a fixed code and later rules still run", () => {
  const addressSecret = {
    get knownSecrets(): readonly string[] { throw new Error(canary); },
  };
  const result = navGateBefore({ ...before, addressSecret });
  assertNoCanary(canary, { result: JSON.stringify(result) });
  checkVerdict(result, NAV_GATE_RULES_BEFORE, "hold", "address-secret", [
    ["address-secret", "hold"], ["navigation", "go"], ["site-scope", "go"],
  ]);
  assert.equal(result.reasonCode, "rule-error");
  assert.equal(result.answers[0].reasonCode, "rule-error");

  checkVerdict(navGateBefore({ ...before, address: "file:///synthetic.txt", addressSecret }),
    NAV_GATE_RULES_BEFORE, "refuse", "navigation", [["address-secret", "hold"], ["navigation", "refuse"]]);
});

test("missing and non-string addresses are refused without coercion", () => {
  const missing = navGateBefore({ siteScope });
  const coercible = { toString: () => address };
  const nonString = navGateBefore({ ...before, address: coercible });
  for (const result of [missing, nonString]) {
    checkVerdict(result, NAV_GATE_RULES_BEFORE, "refuse", "address-secret", [["address-secret", "refuse"]]);
    assert.equal(result.reasonCode, "invalid-address");
  }

  const badHop = navGateAfter({
    ...after,
    redirectChain: { ...after.redirectChain, hops: [{ ...hop, address: coercible as unknown as string }] },
  });
  checkVerdict(badHop, NAV_GATE_RULES_AFTER, "refuse", "redirect-chain", [["redirect-chain", "refuse"]]);

  const missingPageAddress = navGateAfter({
    ...after,
    securityFacts: { ...after.securityFacts, url: undefined as unknown as string },
  });
  checkVerdict(missingPageAddress, NAV_GATE_RULES_AFTER, "refuse", "certificate", [
    ["redirect-chain", "go"], ["certificate", "refuse"],
  ]);
});
