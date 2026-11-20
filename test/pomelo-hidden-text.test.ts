import assert from "node:assert/strict";
import test from "node:test";
import { MASK } from "../src/pomelo/mask.js";
import { dropHiddenText, type HiddenTextElement } from "../src/pomelo/browser/hidden-text.js";
import { HIDDEN } from "../src/secrets.js";

const window = Object.freeze({ width: 800, height: 600 });
const visible: HiddenTextElement = Object.freeze({
  text: "Search results",
  displayed: true,
  visibility: "visible",
  opacity: 1,
  box: Object.freeze({ x: 10, y: 20, width: 120, height: 24 }),
  color: "#123",
  backgroundColor: "#fff",
  ariaHidden: false,
});

test("keeps visible elements unchanged and in order, including visible aria-hidden text", () => {
  const ariaHidden = { ...visible, text: "Decorative text", ariaHidden: true };
  const partlyVisible = { ...visible, text: "At the edge", box: { x: 795, y: 20, width: 120, height: 24 } };
  const result = dropHiddenText(Object.freeze([visible, { ...visible, displayed: false }, ariaHidden, partlyVisible]), window);
  assert.deepEqual(result.kept, [
    { index: 0, element: visible },
    { index: 2, element: ariaHidden },
    { index: 3, element: partlyVisible },
  ]);
  assert.equal(result.droppedCount, 1);
});

test("leaves out hidden text with a plain marker and a reason for each element", () => {
  const text = "A longer line of text that cannot be seen inside a single pixel";
  const result = dropHiddenText([
    { ...visible, displayed: false },
    { ...visible, visibility: "hidden" },
    { ...visible, opacity: 0 },
    { ...visible, text, box: { x: 10, y: 20, width: 0, height: 0 } },
    { ...visible, text, box: { x: 10, y: 20, width: 0, height: 24 } },
    { ...visible, text, box: { x: 10, y: 20, width: 1, height: 1 } },
    { ...visible, box: { x: -5000, y: 20, width: 120, height: 24 } },
    { ...visible, box: { x: 10, y: 5000, width: 120, height: 24 } },
    { ...visible, color: " #AbC ", backgroundColor: "rgb(170, 187, 204)" },
    { ...visible, color: "rgb(100% 100% 100% / 50%)", backgroundColor: "#FFFFFF" },
    { ...visible, color: "#1230" },
    { text, displayed: false },
  ], window);
  const reasons = [
    "not-displayed", "not-visible", "zero-opacity", "tiny-box", "tiny-box", "tiny-box",
    "off-screen", "off-screen", "same-color", "same-color", "transparent-text", "not-displayed",
  ];
  assert.deepEqual(result, {
    kept: [],
    droppedCount: reasons.length,
    dropped: reasons.map((reason, index) => ({ index, reason, marker: "[hidden text left out]" })),
  });
});

test("keeps short visually hidden form labels when they are available to screen readers", () => {
  const label = { ...visible, text: "Search", labelsFormField: true, box: { x: 10, y: 20, width: 1, height: 1 } };
  const result = dropHiddenText([
    label,
    { ...label, text: "Result ".repeat(100) },
    { ...label, labelsFormField: false },
    { ...label, ariaHidden: true },
    { ...label, displayed: false },
    { ...label, visibility: "hidden" },
  ], window);
  assert.deepEqual(result.kept, [{ index: 0, element: label, flag: "screen-reader-label" }]);
  assert.deepEqual(result.dropped.map(({ reason }) => reason), [
    "tiny-box", "tiny-box", "tiny-box", "not-displayed", "not-visible",
  ]);
});

test("flags missing facts and unparsed colors as unclear", () => {
  const missing = { text: "Partial read" };
  const unparsed = { ...visible, color: "unknown", backgroundColor: "unknown" };
  const invalidColor = { ...visible, color: "rgb(, 0, 0)", backgroundColor: "#000" };
  const transparentBackground = { ...visible, backgroundColor: "rgba(0, 0, 0, 0)" };
  const result = dropHiddenText([missing, unparsed, invalidColor, transparentBackground], window);
  assert.deepEqual(result.kept, [missing, unparsed, invalidColor, transparentBackground].map((element, index) =>
    ({ index, element, flag: "unclear" }),
  ));
  assert.equal(result.droppedCount, 0);
  assert.deepEqual(dropHiddenText([visible], undefined).kept, [{ index: 0, element: visible, flag: "unclear" }]);
});

test("preserves mask markers without passing through surrounding hidden text or metadata", () => {
  const canary = "fixture-only-hidden-text-canary";
  const visibleMask = { ...visible, text: `Account: ${MASK}` };
  const maskOnly = { ...visible, text: MASK, displayed: false };
  const hidden = Object.freeze({ ...visible, text: canary, displayed: false });
  const mixed = Object.freeze({
    ...hidden,
    text: `${canary} ${MASK}${MASK} ${canary} ${HIDDEN}`,
    extra: { copiedText: canary },
  });
  const result = dropHiddenText([visibleMask, maskOnly, hidden, mixed], window);
  assert.equal(JSON.stringify(result).includes(canary), false);
  assert.deepEqual(result.kept, [{ index: 0, element: visibleMask }, { index: 1, element: maskOnly }]);
  assert.deepEqual(result.dropped, [
    { index: 2, reason: "not-displayed", marker: "[hidden text left out]" },
    { index: 3, reason: "not-displayed", marker: "[hidden text left out]", maskMarkers: [MASK, MASK, HIDDEN] },
  ]);
  assert.equal(result.droppedCount, 2);
});

test("handles malformed plain data without throwing or keeping invalid entries", () => {
  assert.deepEqual(Reflect.apply(dropHiddenText, undefined, [{}, null]), { kept: [], dropped: [], droppedCount: 0 });
  const malformed = { ...visible, box: { x: 10, y: 20, width: NaN, height: 24 } };
  const result = Reflect.apply(dropHiddenText, undefined, [[null, false, {}, { text: 42 }, malformed], window]);
  assert.deepEqual(result, { kept: [{ index: 4, element: malformed, flag: "unclear" }], dropped: [], droppedCount: 0 });
});
