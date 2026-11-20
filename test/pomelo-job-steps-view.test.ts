import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jobStepRows, type MaskedJobStep } from "../src/client/pomelo/job-steps.js";
import { PomeloJobSteps } from "../src/client/pomelo/PomeloJobSteps.js";

const now = 10_000_000;

function render(steps: readonly MaskedJobStep[]): string {
  return renderToStaticMarkup(createElement(PomeloJobSteps, { rows: jobStepRows(steps, { now }) }));
}

test("renders each step in order with its label, state, time and applicable marks", () => {
  const html = render([
    { id: "click", kind: "click", state: "running", at: now, masked: false },
    { id: "fill", kind: "fill", state: "done", at: now - 120_000, referenceLabel: "כניסה לחשבון" },
    { id: "held", kind: "held", at: now - 7_200_000, masked: false },
  ]);

  assert.equal(html.match(/<ol\b/g)?.length, 1);
  assert.match(html, /^<ol\b[^>]*\bdir="auto"[^>]*>[\s\S]*<\/ol>$/);
  const items = Array.from(html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g), ([item]) => item);
  const itemText = items.map((item) => Array.from(item.matchAll(/>([^<]+)</g), ([, value]) => value));
  assert.deepEqual(itemText, [
    ["Click", "running", "just now"],
    ["Filled from כניסה לחשבון", "done", "2 min ago", "masked"],
    ["Held", "waiting", "2 h ago", "needs you"],
  ]);
});

test("renders a plain empty message when the job has no steps", () => {
  const html = render([]);
  assert.match(html, /^<p\b[^>]*>No steps yet<\/p>$/);
  assert.doesNotMatch(html, /<ol\b/);
});

test("renders the fill reference without leaking the value or note canary", () => {
  const canary = "CANARY-7f3a-pomelo-secret";
  const steps = [
    { id: "fill", kind: "fill", state: "done", referenceLabel: "Demo login", value: canary, note: canary },
    { id: "type", kind: "type", state: "done", charCount: canary.length, value: canary, note: canary },
  ];
  const html = render(steps);

  assert.match(html, />Filled from Demo login</);
  assert.equal(html.includes(canary), false, "plain canary");
  const urlDecoded = html.replace(/%([0-9a-f]{2})/gi, (_, byte) => String.fromCharCode(Number.parseInt(byte, 16)));
  assert.equal(urlDecoded.includes(canary), false, "URL-encoded canary");
  assert.equal(html.includes(Buffer.from(canary, "utf8").toString("base64")), false, "base64 canary");
});
