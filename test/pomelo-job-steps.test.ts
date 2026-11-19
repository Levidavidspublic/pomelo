import assert from "node:assert/strict";
import test from "node:test";
import { jobStepRows, type MaskedJobStep } from "../src/client/pomelo/job-steps.js";

const now = 10_000_000;

function step(kind: string, overrides: Partial<MaskedJobStep> = {}): MaskedJobStep {
  return { id: kind, kind, state: "done", at: now, ...overrides };
}

test("each browser action gets a plain label and rows keep the stored order", () => {
  const steps = Object.freeze([
    step("open", { target: "https://example.invalid/form", at: now - 120_000 }),
    step("click"),
    step("type", { charCount: 12 }),
    step("fill", { target: "password", referenceLabel: "Bank login", masked: false }),
    step("read"),
    step("screenshot"),
    step("download"),
    step("wait"),
    step("held"),
    step("toString"),
  ]);

  const rows = jobStepRows(steps, { now });

  assert.deepEqual(rows.map(({ id }) => id), steps.map(({ id }) => id));
  assert.deepEqual(rows.map(({ label }) => label), [
    "Opened example.invalid/form", "Clicked", "Typed text (12 characters)",
    "Filled password from Bank login", "Read page", "Took screenshot", "Downloaded", "Waited", "Held", "Step",
  ]);
  assert.deepEqual(rows[3], {
    id: "fill", label: "Filled password from Bank login", state: "done", timeLabel: "just now", masked: true, needsAmit: false,
  });
});

test("open labels contain only the address host and path", () => {
  const queryCanary = "query-fixture-canary";
  const rows = jobStepRows([
    step("open", { target: `https://fixture-user:fixture-pass@example.invalid:8443/form?token=${queryCanary}#section` }),
    step("open", { target: `not an address?token=${queryCanary}` }),
    step("open", { target: `javascript:${queryCanary}` }),
  ], { now });

  assert.deepEqual(rows.map(({ label }) => label), ["Opened example.invalid:8443/form", "Opened address", "Opened address"]);
  assert.equal(JSON.stringify(rows).includes(queryCanary), false);
});

test("fill and type rows ignore raw input fields and never display a vault path", () => {
  const canary = "made-up-step-value-83f7";
  const rawFields = { value: canary, text: canary, password: canary, cookie: canary, token: canary, note: canary };
  const steps = [
    { ...step("fill", { referenceLabel: "Bank login" }), ...rawFields, opRef: "op://fixture/item/field" },
    { ...step("fill", { referenceLabel: "op://fixture/item/field" }), ...rawFields },
    { ...step("type", { charCount: 1, target: canary }), ...rawFields },
    { ...step("type"), ...rawFields },
  ];

  const rows = jobStepRows(steps, { now });

  assert.deepEqual(rows.map(({ label }) => label), ["Filled from Bank login", "Filled field", "Typed text (1 character)", "Typed text"]);
  const serialized = JSON.stringify(rows);
  assert.equal(serialized.includes(canary), false);
  assert.equal(serialized.includes("op://"), false);
});

test("failed, held, running and skipped rows show their actual status", () => {
  const rows = jobStepRows([
    step("click", { state: "failed", masked: false }),
    step("held", { state: "done" }),
    step("held", { state: "failed" }),
    step("fill", { state: "held", referenceLabel: "Bank login" }),
    step("read", { state: "running" }),
    step("download", { state: "skipped" }),
    step("wait", { state: "waiting", needsAmit: true }),
    step("unknown", { state: "toString" }),
  ], { now });

  assert.deepEqual(rows.map(({ label, state, masked, needsAmit }) => [label, state, masked, needsAmit]), [
    ["Click", "failed", false, false],
    ["Held", "waiting", true, true],
    ["Held", "failed", true, true],
    ["Fill from Bank login", "waiting", true, true],
    ["Read page", "running", true, false],
    ["Download", "skipped", true, false],
    ["Wait", "waiting", true, true],
    ["Step", "waiting", true, false],
  ]);
});

test("step times are relative to the supplied clock", () => {
  const rows = jobStepRows([
    step("click", { at: now - 5_000 }),
    step("click", { at: now - 120_000 }),
    step("click", { at: now - 7_200_000 }),
    step("click", { at: now + 60_000 }),
    step("click", { at: undefined }),
  ], { now });

  assert.deepEqual(rows.map(({ timeLabel }) => timeLabel), ["just now", "2 min ago", "2 h ago", "just now", "Time unknown"]);
});

test("existing log strings keep their order and only contribute the action kind", () => {
  const rows = jobStepRows(["type legacy-fixture", "fill op://fixture/item/field ••••", "unrecognized legacy-fixture"], { now });

  assert.deepEqual(rows, [
    { id: "step-0", label: "Type text", state: "waiting", timeLabel: "Time unknown", masked: true, needsAmit: false },
    { id: "step-1", label: "Fill field", state: "waiting", timeLabel: "Time unknown", masked: true, needsAmit: false },
    { id: "step-2", label: "Step", state: "waiting", timeLabel: "Time unknown", masked: true, needsAmit: false },
  ]);
});

test("a job with no steps has no rows", () => {
  assert.deepEqual(jobStepRows([], { now }), []);
});
