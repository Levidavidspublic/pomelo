import assert from "node:assert/strict";
import { test } from "node:test";
import { widgetAnswer, widgetState } from "../src/client/pomelo/widget-answer.js";

const textWidget = { type: "text", label: "Topic" } as const;
const numberWidget = { type: "number", label: "Amount" } as const;
const toggleWidget = { type: "toggle", label: "Include summary" } as const;
const selectWidget = { type: "select" as const, label: "Format", options: ["List", "Table"] };

test("trims and caps text widget answers", () => {
  assert.deepEqual(widgetAnswer(textWidget, "  Garden plans  "), {
    ok: true, value: "Garden plans", message: "Topic: Garden plans",
  });
  const text = "a".repeat(2000);
  assert.deepEqual(widgetAnswer(textWidget, `  ${text}extra  `), {
    ok: true, value: text, message: `Topic: ${text}`,
  });
  assert.equal(widgetAnswer(textWidget, "").ok, false);
  assert.equal(widgetAnswer(textWidget, " \t\n ").ok, false);
  assert.equal(widgetAnswer(textWidget, 12).ok, false);
});

test("accepts finite numbers and numeric strings", () => {
  assert.deepEqual(widgetAnswer(numberWidget, 0), { ok: true, value: 0, message: "Amount: 0" });
  assert.deepEqual(widgetAnswer(numberWidget, "12.5"), { ok: true, value: 12.5, message: "Amount: 12.5" });
  for (const raw of ["abc", " ", "12.5kg", "1e999", NaN, Infinity, null, true, [12.5]]) {
    assert.equal(widgetAnswer(numberWidget, raw).ok, false, `Rejected input: ${String(raw)}`);
  }
});

test("keeps toggle values boolean and says yes or no", () => {
  assert.deepEqual(widgetAnswer(toggleWidget, true), { ok: true, value: true, message: "Include summary: yes" });
  assert.deepEqual(widgetAnswer(toggleWidget, false), { ok: true, value: false, message: "Include summary: no" });
  assert.equal(widgetAnswer(toggleWidget, "true").ok, false);
});

test("selects an exact option from the widget", () => {
  assert.deepEqual(widgetAnswer(selectWidget, "Table"), { ok: true, value: "Table", message: "Format: Table" });
  assert.equal(widgetAnswer(selectWidget, "table").ok, false);
  assert.equal(widgetAnswer(selectWidget, "  Table  ").ok, false);
  assert.equal(widgetAnswer(selectWidget, ["Table"]).ok, false);
});

test("keeps the message on one line while preserving the checked value", () => {
  assert.deepEqual(widgetAnswer({ ...textWidget, label: "Project\r\nnotes" }, " First\nSecond\u2028Third "), {
    ok: true, value: "First\nSecond\u2028Third", message: "Project notes: First Second Third",
  });
});

test("marks answers sent on acknowledgment and gives errors precedence", () => {
  assert.equal(widgetState({ sent: false, acknowledged: false }), "idle");
  assert.equal(widgetState({ sent: true, acknowledged: false }), "sending");
  assert.equal(widgetState({ sent: true, acknowledged: true }), "sent");
  assert.equal(widgetState({ sent: false, acknowledged: true }), "sent");
  assert.equal(widgetState({ sent: true, acknowledged: true, error: "Send failed" }), "error");
  assert.equal(widgetState({ sent: true, acknowledged: false, error: "Send failed" }), "error");
  assert.equal(widgetState({ sent: false, acknowledged: false, error: "Send failed" }), "error");
});
