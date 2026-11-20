import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloApprovalCard } from "../src/client/pomelo/PomeloApprovalCard.js";
import type { ApprovalRequest } from "../src/client/pomelo/approval-card.js";

const now = 1_000;
const request: ApprovalRequest = {
  id: "request-1",
  action: "fill",
  origin: "https://example.test:8443/sign-in",
  account: "Personal",
  change: "Fill the sign-in form",
  state: "pending",
  expiresAt: now + 1,
};

function render(approval: ApprovalRequest) {
  return renderToStaticMarkup(createElement(PomeloApprovalCard, {
    request: approval,
    now,
    onApprove: () => {},
    onDeny: () => {},
    onEdit: () => {},
  }));
}

function buttonLabels(html: string) {
  return Array.from(html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g), ([, label]) => label);
}

test("a waiting fill shows its status, four labelled details and ordered buttons", () => {
  const html = render(request);
  assert.match(html, /data-status="waiting"/);
  assert.match(html, /data-tone="neutral"/);
  assert.match(html, /<[^>]+\brole="status"[^>]*>Waiting for approval<\//);

  const details = html.match(/<dl\b[^>]*>(.*?)<\/dl>/)?.[1] ?? "";
  const lines = Array.from(details.matchAll(/<dt\b[^>]*>([^<]*)<\/dt><dd\b[^>]*>([^<]*)<\/dd>/g),
    ([, label, text]) => [label, text]);
  assert.deepEqual(lines, [
    ["Action", "Fill a saved login"],
    ["Site", "https://example.test:8443"],
    ["Account", "Personal"],
    ["Change", "Fill the sign-in form"],
  ]);
  assert.deepEqual(buttonLabels(html), ["Approve", "Deny", "Edit"]);
});

test("a waiting card displays the action for imports and grants", () => {
  assert.match(render({ ...request, action: "import" }), /<dd\b[^>]*>Import cookies from Chrome<\/dd>/);
  assert.match(render({ ...request, action: "grant" }), /<dd\b[^>]*>Allow fills on this site<\/dd>/);
});

test("a waiting request with an invalid site offers only Deny and Edit", () => {
  const html = render({ ...request, origin: "not an address" });
  assert.match(html, /data-status="waiting"/);
  assert.match(html, /data-tone="bad"/);
  assert.match(html, /<dd\b[^>]*>Unknown site<\/dd>/);
  assert.deepEqual(buttonLabels(html), ["Deny", "Edit"]);
});

const settledCases = [
  { state: "approved", status: "approved", tone: "good" },
  { state: "denied", status: "denied", tone: "bad" },
  { state: "pending", status: "expired", tone: "warn" },
] as const;

for (const { state, status, tone } of settledCases) {
  test(`a settled card shows the ${status} state without buttons`, () => {
    const html = render({ ...request, state, expiresAt: now });
    assert.match(html, new RegExp(`data-status="${status}"`));
    assert.match(html, new RegExp(`data-tone="${tone}"`));
    assert.match(html, new RegExp(`<[^>]+\\brole="status"[^>]*>Request ${status}<\\/`));
    assert.doesNotMatch(html, /<button\b/);
  });
}

test("an account label containing markup is escaped", () => {
  const html = render({ ...request, account: "<img onerror>" });
  assert.match(html, /&lt;img onerror&gt;/);
  assert.doesNotMatch(html, /<img\b/);
});

test("Hebrew account and change text keep their content and use automatic direction", () => {
  const html = render({ ...request, account: "חשבון אישי", change: "מילוי טופס התחברות" });
  assert.match(html, /<dt\b[^>]*>Account<\/dt><dd\b[^>]*\bdir="auto"[^>]*>חשבון אישי<\/dd>/);
  assert.match(html, /<dt\b[^>]*>Change<\/dt><dd\b[^>]*\bdir="auto"[^>]*>מילוי טופס התחברות<\/dd>/);
});

test("extra request fields never appear in the rendered card", () => {
  const approval = { ...request, value: "CANARY-pomelo-7f3a91" };
  assert.doesNotMatch(render(approval), /CANARY-pomelo-7f3a91/);
});
