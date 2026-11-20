import assert from "node:assert/strict";
import test from "node:test";
import {
  decideConsentBanner,
  type ConsentBannerRead,
  type ConsentButton,
  type ConsentDecision,
} from "../src/pomelo/browser/consent-rule.js";

function button(label: string, ref = 1): ConsentButton {
  return { label, ref, role: "button" };
}

function blocking(...buttons: ConsentButton[]): ConsentBannerRead {
  return { banner: { blocksPage: true, buttons } };
}

function assertHold(read: ConsentBannerRead, code: Extract<ConsentDecision, { action: "hold" }>["code"]): void {
  const decision = decideConsentBanner(read);
  assert.equal(decision.action, "hold");
  assert.equal(decision.code, code);
  assert.match(decision.reason, /^[^.!?\n]+\.$/);
}

test("returns none when there is no consent banner", () => {
  assert.deepEqual(decideConsentBanner({}), { action: "none" });
  assert.deepEqual(decideConsentBanner({ banner: null, siteChoice: "ask" }), { action: "none" });
});

test("uses the reject button's reference when accept all is also offered", () => {
  const read = blocking(button("Accept all", 2), button("Reject all", 7));
  assert.deepEqual(decideConsentBanner(read), { action: "press", ref: 7 });
});

test("recognizes English and Hebrew refusals and necessary-only choices", () => {
  for (const label of [
    "Only necessary", "Decline", "Use necessary cookies only", "דחה הכל", "רק הכרחיות",
    "  REJECT\t\n  ALL  ", "  רק\u00a0הכרחיות ",
  ]) {
    assert.deepEqual(decideConsentBanner(blocking(button(label, 3))), { action: "press", ref: 3 }, label);
  }
});

test("holds banners whose only clear choice is to accept", () => {
  for (const label of ["Accept", "Accept all", "Agree", "Allow all", "אשר הכל"]) {
    assertHold(blocking(button(label)), "accept-only");
  }
});

test("holds when consent requires a settings step", () => {
  const manage = button("Manage options");
  assertHold(blocking(manage), "needs-steps");
  assertHold(blocking(manage, button("Accept all", 2)), "needs-steps");
});

test("holds when more than one button matches the default", () => {
  assertHold(blocking(button("Reject all"), button("Decline", 2)), "unclear");
  assertHold(blocking(button("Reject all"), button("Only necessary", 2)), "unclear");
});

test("leaves a nonblocking banner alone by default", () => {
  const read = { banner: { blocksPage: false, buttons: [button("Reject all")] } };
  assert.deepEqual(decideConsentBanner(read), { action: "leave" });
});

test("uses Amit's accept choice only on the read that supplies it", () => {
  const buttons = [button("Reject all"), button("Accept all", 2)];
  const read = blocking(...buttons);
  assert.deepEqual(decideConsentBanner({ ...read, siteChoice: "accept" }), { action: "press", ref: 2 });
  assert.deepEqual(decideConsentBanner({ banner: { blocksPage: false, buttons }, siteChoice: "accept" }), {
    action: "press", ref: 2,
  });
  assert.deepEqual(decideConsentBanner(blocking(...buttons)), { action: "press", ref: 1 });
  assertHold({ ...blocking(button("Reject all")), siteChoice: "accept" }, "unclear");
  assertHold({ ...blocking(button("Accept all"), button("Agree", 2)), siteChoice: "accept" }, "unclear");
});

test("honors Amit's ask choice whenever there is a banner", () => {
  assertHold({ ...blocking(button("Reject all")), siteChoice: "ask" }, "ask");
  assertHold({ banner: { blocksPage: false, buttons: [button("Reject all")] }, siteChoice: "ask" }, "ask");
});

test("requires an exact and visible consent label even with a site choice", () => {
  for (const label of [
    "Got it", "OK", "", "  ", "••••", "[secret hidden]", "Reject all ••••",
    "Accept and never reject", "Reject tracking and accept all other cookies",
  ]) {
    const read = blocking(button(label));
    assertHold(read, "unclear");
    assertHold({ ...read, siteChoice: "accept" }, "unclear");
  }
});

test("requires a button with a usable and unique element reference", () => {
  assertHold(blocking({ ...button("Reject all"), role: "link" }), "unclear");
  for (const ref of [0, -1, 1.5, NaN, Infinity]) {
    assertHold(blocking(button("Reject all", ref)), "unclear");
  }
  assertHold(blocking(button("Reject all"), button("Accept all")), "unclear");
  assertHold(blocking(), "unclear");
});

test("keeps arbitrary page text and unclear labels out of held decisions", () => {
  const text = "Synthetic banner body";
  const label = "Synthetic button label";
  const read = {
    origin: "https://fictional-banner.test",
    text,
    banner: { blocksPage: true, buttons: [button(label)], text },
  };
  const decision = decideConsentBanner(read);
  assert.equal(decision.action, "hold");
  assert.ok(!JSON.stringify(decision).includes(text));
  assert.ok(!JSON.stringify(decision).includes(label));
  assert.ok(!JSON.stringify(decision).includes(read.origin));
});
