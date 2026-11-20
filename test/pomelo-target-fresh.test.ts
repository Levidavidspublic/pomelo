import assert from "node:assert/strict";
import test from "node:test";
import { checkTargetFresh } from "../src/pomelo/browser/target-fresh.js";

const canary = "synthetic-page-label-canary";
const button = { ref: 1, label: `Continue ${canary}` };
const secretField = { ref: 2, label: `Masked field ${canary}`, masked: true };
const read = {
  readId: "read-2",
  pageUrl: "https://example.test/form",
  frame: "top",
  elements: [button, secretField],
};
const click = {
  action: "click",
  ref: button.ref,
  readId: read.readId,
  pageUrl: read.pageUrl,
  frame: read.frame,
} as const;
const type = { ...click, action: "type" } as const;

function check(
  action: Parameters<typeof checkTargetFresh>[0],
  latestRead: Parameters<typeof checkTargetFresh>[1],
  decision: ReturnType<typeof checkTargetFresh>["decision"],
): void {
  const result = checkTargetFresh(action, latestRead);
  assert.equal(result.decision, decision);
  assert.match(result.reason, /^[A-Z][^\n]+\.$/);
  assert.equal(result.reason.includes(canary), false);
  if (decision === "reread") assert.match(result.reason, /fresh masked read/i);
}

test("allows a ref from the newest read on the same page and frame", () => {
  check(click, read, "go");
  check(type, read, "go");
});

test("requires a fresh masked read when the action uses an older read id", () => {
  check({ ...click, readId: "read-1" }, read, "reread");
});

test("requires a fresh masked read after the origin changes", () => {
  check(click, { ...read, pageUrl: "https://other.test/form" }, "reread");
});

test("requires a fresh masked read after the path changes on the same origin", () => {
  check(click, { ...read, pageUrl: "https://example.test/other-form" }, "reread");
});

test("compares the parsed origin and path", () => {
  check({ ...click, pageUrl: "https://EXAMPLE.test:443/other/../form?view=compact#start" }, read, "go");
});

test("requires a fresh masked read when the frame changes", () => {
  check(click, { ...read, frame: "child" }, "reread");
});

test("requires a fresh masked read when the ref disappears", () => {
  check(click, { ...read, elements: [secretField] }, "reread");
});

test("refuses an action without a read id", () => {
  const { readId, ...withoutReadId } = click;
  check(withoutReadId, read, "refuse");
  check({ ...click, readId: "" }, read, "refuse");
});

test("refuses typing into a masked secret field and directs the agent to the broker", () => {
  const action = { ...type, ref: secretField.ref };
  check(action, read, "refuse");
  assert.match(checkTargetFresh(action, read).reason, /broker/i);
});

test("allows clicking a fresh ref for a masked secret field", () => {
  check({ ...click, ref: secretField.ref }, read, "go");
});

test("refuses broken addresses on either side without echoing them", () => {
  check({ ...click, pageUrl: canary }, read, "refuse");
  check(click, { ...read, pageUrl: `https://[${canary}` }, "refuse");
});

test("refuses addresses that have no comparable origin", () => {
  const pageUrl = "about:blank";
  check({ ...click, pageUrl }, { ...read, pageUrl }, "refuse");
});
