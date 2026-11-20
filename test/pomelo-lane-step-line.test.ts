import assert from "node:assert/strict";
import test from "node:test";
import { laneStepLine } from "../src/pomelo/lane-step-line.js";

const canary = "made-up-test-canary";

test("uses Friday's plain tool labels without showing arguments, paths or output", () => {
  const path = "/fixtures/example.txt";
  const step = {
    kind: "tool",
    toolName: "read_file",
    arguments: { path, value: canary },
    text: `Read ${path}: ${canary}`,
  };
  assert.equal(laneStepLine(step), "Reading a file");
  assert.equal(laneStepLine({ kind: "tool", toolName: "shell" }), "Running a command");
  assert.equal(laneStepLine({ kind: "tool" }), "Using a tool");
});

test("cleans and limits the label of an unknown tool", () => {
  assert.equal(laneStepLine({ kind: "tool", toolName: "custom\u0000_\u202etool" }), "Using custom_tool");
  assert.equal(laneStepLine({ kind: "tool", toolName: "x".repeat(100) }), `Using ${"x".repeat(53)}…`);
  assert.equal(laneStepLine({ kind: "tool", toolName: "constructor" }), "Using constructor");
  assert.equal(laneStepLine({ kind: "tool", toolName: "/fixtures/example.txt" }), "");
  assert.equal(laneStepLine({ kind: "tool", toolName: `sk-${canary}` }), "Using ••••");
  assert.equal(laneStepLine({ kind: "tool", toolName: `custom_sk-${canary}` }), "Using ••••");
});

test("keeps the first sentence and removes Markdown markers", () => {
  assert.equal(laneStepLine({ kind: "text", text: "**Found** three sources. Now reading." }), "Found three sources.");
  assert.equal(laneStepLine({ kind: "text", text: "## _Read_ [the guide](https://example.invalid) with `custom_tool`." }),
    "Read the guide with custom_tool.");
});

test("masks recognizable credentials and vault references before selecting the sentence or clipping", () => {
  const cases = [
    [`sk-${canary}`, "••••"],
    [`Bearer ${canary}.fragment`, "Bearer ••••"],
    [`password=${canary}`, "password=••••"],
    [`op://vault/item/${canary}`, "••••"],
    [`access_token: "${canary} extra words"`, "access_token: ••••"],
    [`password=**${canary} extra words**`, "password=••••"],
    [`\`op://Example Vault/Demo Item/${canary} field\``, "••••"],
    [`Cookie: first=${canary}; second=${canary}`, "Cookie: ••••"],
  ];
  for (const [raw, masked] of cases) {
    assert.equal(laneStepLine({ kind: "text", text: raw }), masked);
  }
  assert.equal(laneStepLine({ kind: "text", text: `Found password=${canary}. Now reading.` }),
    "Found password=••••.");
  const prefix = "x".repeat(55);
  assert.equal(laneStepLine({ kind: "text", text: `${prefix} sk-${canary} today` }), `${prefix} •••…`);
});

test("uses fixed lines for waiting, completion and errors", () => {
  assert.equal(laneStepLine({ kind: "wait", text: canary }), "Waiting");
  assert.equal(laneStepLine({ kind: "done", text: canary }), "Done");
  assert.equal(laneStepLine({ kind: "error", text: `Error: ${canary}\n    at /fixtures/example.txt:1:1` }), "Hit a problem");
});

test("clips long Hebrew without separating letters from their marks", () => {
  const letter = "שָׁ";
  const result = laneStepLine({ kind: "text", text: letter.repeat(67) });
  assert.ok(result.length <= 60);
  assert.equal(result, `${letter.repeat(19)}…`);
  assert.equal(laneStepLine({ kind: "text", text: letter.repeat(20) }), letter.repeat(20));
  const prefix = "x".repeat(56);
  assert.equal(laneStepLine({ kind: "text", text: `${prefix}👩🏽‍💻 more` }), `${prefix}…`);
});

test("uses code points and keeps Hebrew marks attached when Segmenter is unavailable", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter")!;
  Object.defineProperty(Intl, "Segmenter", { ...descriptor, value: undefined });
  try {
    const prefix = "x".repeat(58);
    assert.equal(laneStepLine({ kind: "text", text: `${prefix}שָׁ more` }), `${prefix}…`);
    assert.equal(laneStepLine({ kind: "text", text: `${prefix}😀 more` }), `${prefix}…`);
  } finally {
    Object.defineProperty(Intl, "Segmenter", descriptor);
  }
});

test("folds newlines and tabs into single spaces", () => {
  assert.equal(laneStepLine({ kind: "text", text: "  Found\n\tthree\r\n sources.\n Now reading." }), "Found three sources.");
});

test("returns an empty line for missing or malformed steps", () => {
  const unreadable = { get kind() { throw new Error("unreadable"); } };
  for (const step of [undefined, null, 42, {}, [], unreadable, { kind: "unknown" },
    { kind: "text" }, { kind: "text", text: 42 }, { kind: "tool", toolName: {} }]) {
    assert.equal(laneStepLine(step), "");
  }
});
