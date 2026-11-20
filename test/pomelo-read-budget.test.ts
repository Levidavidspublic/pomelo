import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PAGE_READ_BUDGET, trimPageRead } from "../src/pomelo/browser/read-budget.js";
import { MASK } from "../src/pomelo/mask.js";

test("a small masked read comes back unchanged with the default budget", () => {
  const lines = Object.freeze([
    Object.freeze({ role: "heading", text: "Example page" }),
    Object.freeze({ role: "textbox", text: `Password ${MASK}`, secret: true }),
  ]);
  assert.deepEqual(trimPageRead({ lines, maskMarker: MASK }), {
    lines, dropped: 0, truncated: false, note: null,
  });
  assert.ok(Number.isSafeInteger(DEFAULT_PAGE_READ_BUDGET) && DEFAULT_PAGE_READ_BUDGET > 0);
});

test("a large read keeps a whole prefix and reports the number of omitted elements", () => {
  const first = { role: "heading", text: "Example page" };
  const second = { role: "textbox", text: `Password ${MASK}`, secret: true };
  const lines = [first, second, ...Array.from({ length: 240 }, () => ({ role: "link", text: "More" }))];
  const maxChars = Array.from(`${first.text}\n${second.text}`).length;

  assert.deepEqual(trimPageRead({ lines, maxChars, maskMarker: MASK }), {
    lines: [first, second], dropped: 240, truncated: true, note: "…240 more elements not shown",
  });
  // Reducing the budget by one removes the entire masked line, even though later lines are shorter.
  assert.deepEqual(trimPageRead({ lines, maxChars: maxChars - 1, maskMarker: MASK }), {
    lines: [first], dropped: 241, truncated: true, note: "…241 more elements not shown",
  });
});

test("an oversized line keeps only its role and leaves room for following elements", () => {
  const next = { role: "link", text: "Next" };
  const lines = [{ role: "textbox", text: `${"x".repeat(200)} ${MASK}`, secret: true }, next];

  assert.deepEqual(trimPageRead({ lines, maxChars: 12, maskMarker: MASK }), {
    lines: [{ role: "textbox", text: "textbox" }, next],
    dropped: 0,
    truncated: true,
    note: "…1 element shown by role only",
  });
  assert.deepEqual(trimPageRead({ lines, maxChars: 6, maskMarker: MASK }), {
    lines: [], dropped: 2, truncated: true, note: "…2 more elements not shown",
  });
});

test("a flagged line without the full marker refuses the entire read, even beyond the cutoff", () => {
  const visible = { role: "heading", text: "Page" };
  const flagged = { role: "textbox", secret: true, text: "Password •••" };

  assert.deepEqual(trimPageRead({ lines: [visible, flagged], maxChars: 4, maskMarker: MASK }), {
    ok: false, reason: "unmasked-line",
  });
  assert.deepEqual(trimPageRead({ lines: [flagged], maskMarker: "" }), {
    ok: false, reason: "unmasked-line",
  });
});

test("Hebrew lines and emoji count as whole Unicode code points", () => {
  const first = { role: "link", text: "שלום 🍊" };
  const second = { role: "link", text: "בית" };
  const lines = [first, second];
  const maxChars = 10;

  assert.deepEqual(trimPageRead({ lines, maxChars, maskMarker: MASK }), {
    lines, dropped: 0, truncated: false, note: null,
  });
  assert.deepEqual(trimPageRead({ lines, maxChars: maxChars - 1, maskMarker: MASK }), {
    lines: [first], dropped: 1, truncated: true, note: "…1 more element not shown",
  });
});

test("discarded, oversized and refused fixtures expose no canary in any tested encoding", () => {
  const canary = "FAKE pomelo+budget/🍊";
  const variants = [canary, encodeURIComponent(canary), Buffer.from(canary).toString("base64")];
  const first = { role: "heading", text: "x".repeat(64) };

  for (const value of variants) {
    const dropped = trimPageRead({ lines: [first, { role: "link", text: value }], maxChars: 64, maskMarker: MASK });
    const oversized = trimPageRead({ lines: [{ role: "link", text: value }], maxChars: 8, maskMarker: MASK });
    const refused = trimPageRead({ lines: [first, { role: "textbox", text: value, secret: true }], maxChars: 64, maskMarker: MASK });
    for (const result of [dropped, oversized, refused]) {
      const serialized = JSON.stringify(result);
      for (const variant of variants) {
        assert.ok(!serialized.includes(variant), "the result must exclude every tested canary encoding");
      }
    }
  }
});
