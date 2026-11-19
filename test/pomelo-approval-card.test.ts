import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalCardView, type ApprovalRequest } from "../src/client/pomelo/approval-card.js";

const now = 1_000;
const request: ApprovalRequest = {
  id: "request-1",
  action: "fill",
  origin: "https://example.test",
  account: "Personal",
  change: "Fill the sign-in form",
  state: "pending",
};

test("a pending approval offers Approve, Deny and Edit in order", () => {
  for (const expiresAt of [undefined, now + 1]) {
    const card = approvalCardView({ ...request, expiresAt }, now);
    assert.equal(card.status, "waiting");
    assert.equal(card.tone, "neutral");
    assert.equal(card.settled, false);
    assert.deepEqual(card.buttons, ["Approve", "Deny", "Edit"]);
  }
});

test("an approved request stays approved after its deadline", () => {
  const card = approvalCardView({ ...request, state: "approved", expiresAt: now - 1 }, now);
  assert.equal(card.status, "approved");
  assert.equal(card.tone, "good");
  assert.equal(card.settled, true);
  assert.deepEqual(card.buttons, []);
});

test("a denied request has no buttons or success wording", () => {
  const card = approvalCardView({ ...request, state: "denied", expiresAt: now - 1 }, now);
  assert.equal(card.status, "denied");
  assert.equal(card.tone, "bad");
  assert.equal(card.settled, true);
  assert.deepEqual(card.buttons, []);
  assert.doesNotMatch(card.headline, /done|approved|complete/i);
});

test("a pending request expires at its deadline and stays expired a millisecond later", () => {
  for (const currentTime of [now, now + 1]) {
    const card = approvalCardView({ ...request, expiresAt: now }, currentTime);
    assert.equal(card.status, "expired");
    assert.equal(card.tone, "warn");
    assert.equal(card.settled, true);
    assert.deepEqual(card.buttons, []);
    assert.doesNotMatch(card.headline, /done|approved|complete/i);
  }
});

test("each action has four display lines and the site shows only its origin", () => {
  const actions = {
    fill: "Fill a saved login",
    import: "Import cookies from Chrome",
    grant: "Allow fills on this site",
  };
  for (const action of ["fill", "import", "grant"] as const) {
    const card = approvalCardView({
      ...request,
      action,
      origin: "https://example.test:8443/sign-in?view=compact#form",
    }, now);
    assert.deepEqual(card.lines, [
      { label: "Action", text: actions[action] },
      { label: "Site", text: "https://example.test:8443" },
      { label: "Account", text: "Personal" },
      { label: "Change", text: "Fill the sign-in form" },
    ]);
  }
});

test("an unknown site cannot be approved", () => {
  for (const origin of ["not a URL", "about:blank"]) {
    const card = approvalCardView({ ...request, origin }, now);
    assert.deepEqual(card.lines[1], { label: "Site", text: "Unknown site" });
    assert.equal(card.status, "waiting");
    assert.equal(card.tone, "bad");
    assert.equal(card.settled, false);
    assert.deepEqual(card.buttons, ["Deny", "Edit"]);
  }
});

test("account and change are trimmed, kept on one line and limited to 120 characters", () => {
  const card = approvalCardView({
    ...request,
    account: `  Personal\r\n${"a".repeat(130)}  `,
    change: `  Fill\n${"b".repeat(130)}  `,
  }, now);
  assert.deepEqual(card.lines.slice(2), [
    { label: "Account", text: `Personal ${"a".repeat(111)}` },
    { label: "Change", text: `Fill ${"b".repeat(115)}` },
  ]);
});

test("an empty account gets a fallback and Hebrew names pass through unchanged", () => {
  const unnamed = approvalCardView({ ...request, account: " \r\n " }, now);
  assert.deepEqual(unnamed.lines[2], { label: "Account", text: "Not named" });

  const hebrew = approvalCardView({ ...request, account: "חשבון אישי" }, now);
  assert.deepEqual(hebrew.lines[2], { label: "Account", text: "חשבון אישי" });
});
