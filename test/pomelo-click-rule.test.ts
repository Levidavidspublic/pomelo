import assert from "node:assert/strict";
import test from "node:test";
import { clickRule } from "../src/pomelo/browser/click-rule.js";

const origin = "https://example.test";
const button = { origin, role: "button" };
const signIn = {
  ...button,
  label: "Sign in",
  inputType: "submit",
  formMethod: "post",
  formHasFilledSecret: true,
  fillGrantOrigin: origin,
};

function check(
  input: Parameters<typeof clickRule>[0],
  action: ReturnType<typeof clickRule>["action"],
  kind: ReturnType<typeof clickRule>["kind"],
): void {
  const result = clickRule(input);
  assert.equal(result.action, action);
  assert.equal(result.kind, kind);
  assert.ok(result.reason.trim());
}

test("allows an ordinary button or navigation link", () => {
  check({ ...button, label: "Next" }, "go", "other");
  check({ origin, role: "link", label: "Payments history" }, "go", "other");
  check({ ...button, label: "משלוח" }, "go", "other");
});

const riskyLabels = [
  ["Pay now", "pay"],
  ["Buy", "buy"],
  ["Place order", "buy"],
  ["Subscribe", "buy"],
  ["Delete account", "delete"],
  ["Remove", "delete"],
  ["Send", "send"],
  ["Transfer", "send"],
  ["Confirm transfer", "confirm"],
  ["(PAY!)", "pay"],
  ["שלם", "pay"],
  ["שַׁלֵּם עכשיו", "pay"],
  ["קנה", "buy"],
  ["הזמן", "buy"],
  ["הירשם למנוי", "buy"],
  ["מחק", "delete"],
  ["הסר", "delete"],
  ["שלח", "send"],
  ["העבר", "send"],
  ["אשר העברה", "confirm"],
] as const;

for (const [label, kind] of riskyLabels) {
  test(`holds a risky action labelled ${label}`, () => {
    check({ ...button, label }, "hold", kind);
  });
}

test("requires the exact action and origin on the same grant", () => {
  const pay = { ...button, label: "Pay now" };
  check({ ...pay, allowedActions: [{ origin: "https://EXAMPLE.test:443", action: "pay" }] }, "go", "pay");
  for (const differentOrigin of ["https://elsewhere.test", "https://sub.example.test", "http://example.test", "https://example.test:444"]) {
    check({ ...pay, allowedActions: [{ origin: differentOrigin, action: "pay" }] }, "hold", "pay");
  }
  check({
    ...pay,
    allowedActions: [{ origin, action: "buy" }, { origin: "https://elsewhere.test", action: "pay" }],
  }, "hold", "pay");
});

test("checks each risky action named in a label before allowing the click", () => {
  const input = { ...button, label: "Confirm transfer" };
  check({ ...input, allowedActions: [{ origin, action: "confirm" }] }, "hold", "send");
  check({ ...input, allowedActions: [{ origin, action: "confirm" }, { origin, action: "send" }] }, "go", "confirm");
});

test("requires the filled secret's own grant to match the page origin", () => {
  check(signIn, "go", "sign_in");
  check({ ...signIn, fillGrantOrigin: "https://elsewhere.test" }, "hold", "sign_in");
  check({ ...signIn, fillGrantOrigin: undefined }, "hold", "sign_in");
});

test("recognizes an explicit form submission and the default submit button", () => {
  check({ ...signIn, inputType: undefined }, "go", "sign_in");
  check({ ...signIn, role: "form", inputType: undefined }, "go", "sign_in");
  check({ ...signIn, action: "submit", role: undefined, inputType: undefined }, "go", "sign_in");
  check({ ...signIn, inputType: "button", label: "Next", fillGrantOrigin: undefined }, "go", "other");
  check({ ...signIn, role: "link", inputType: undefined, label: "Next", fillGrantOrigin: undefined }, "go", "other");
});

test("holds an unclear submit after a secret fill even with a matching grant", () => {
  for (const label of [undefined, "", " \t ", "••••", "[secret hidden]", "•••• [secret hidden]", "Continue ••••"]) {
    check({ ...signIn, label }, "hold", "sign_in");
  }
});

test("requires both the risky action approval and the matching fill grant for a risky submit", () => {
  const pay = { ...signIn, label: "Pay now" };
  check(pay, "hold", "pay");
  const approvedPay = { ...pay, allowedActions: [{ origin, action: "pay" }] } as const;
  check({ ...approvedPay, fillGrantOrigin: "https://elsewhere.test" }, "hold", "pay");
  check(approvedPay, "go", "pay");
  check({ ...approvedPay, label: "Pay ••••" }, "hold", "pay");
});

test("refuses missing, malformed or opaque origins", () => {
  for (const origin of [undefined, "", "not an origin", "about:blank", "null"]) {
    check({ ...button, origin, label: "Next" }, "refuse", "other");
  }
});

test("keeps a synthetic field value and page text out of the decision", () => {
  const canary = "synthetic-click-canary-433";
  const input = { ...signIn, label: `Delete account ${canary}`, fields: [{ value: canary }] };
  const result = clickRule(input);
  assert.equal(result.action, "hold");
  assert.equal(result.kind, "delete");
  assert.deepEqual(Object.keys(result).sort(), ["action", "kind", "reason"]);
  assert.ok(!JSON.stringify(result).includes(canary));
});
