import assert from "node:assert/strict";
import test from "node:test";
import { threadPreview } from "../src/pomelo/thread-preview.js";

const options = { mask: (text: string) => text };
const empty = { text: "", kind: "none" };

test("flattens a user message to one line", () => {
  assert.deepEqual(threadPreview({ kind: "message", text: "  Please check\r\n the chart.  " }, options), {
    text: "Please check the chart.",
    kind: "message",
  });
});

test("keeps the words and code of an agent reply while removing Markdown", () => {
  const text = [
    "## **Ready**",
    "- See [the notes](https://example.invalid) and `run_check_ins`.",
    "```js",
    'const marker = "**";',
    "run_check_ins(marker);",
    "```",
    "> *All done.*",
  ].join("\n");

  assert.deepEqual(threadPreview({ kind: "agent.message", text }, { ...options, maxLength: 100 }), {
    text: 'Ready See the notes and run_check_ins. const marker = "**"; run_check_ins(marker); All done.',
    kind: "agent.message",
  });
});

for (const [kind, label] of [
  ["chart", "Chart"],
  ["artifact", "Artifact"],
  ["diagram", "Diagram"],
  ["image", "Image"],
  ["widget", "Widget"],
]) {
  test(`uses only the title in the ${kind} label`, () => {
    const event = { kind, title: "**Sample**\ncard", text: "Card body stays in the chat." };
    assert.deepEqual(threadPreview(event, options), { text: `${label}: Sample card`, kind });
  });
}

test("uses the tool name without reading its arguments or using its text", () => {
  const event = {
    kind: "tool_call",
    toolName: "mcp__demo__read_file",
    text: "ARGUMENT_CANARY",
    get arguments(): string {
      return assert.fail("Tool arguments must never be read");
    },
  };
  const preview = threadPreview(event, {
    mask(text) {
      assert.equal(text, "mcp__demo__read_file");
      return text;
    },
  });

  assert.deepEqual(preview, { text: "mcp__demo__read_file", kind: "tool_call" });
  assert.doesNotMatch(preview.text, /ARGUMENT_CANARY/);
});

test("summarizes a sub-agent report", () => {
  const kind = "subagent_result";
  assert.deepEqual(threadPreview({ kind, text: "**Research complete.**\nNotes ready." }, options), {
    text: "Research complete. Notes ready.",
    kind,
  });
});

test("summarizes a browser job report", () => {
  const kind = "browser_job_result";
  assert.deepEqual(threadPreview({ kind, text: "Page loaded.\u2028Job done." }, options), {
    text: "Page loaded. Job done.",
    kind,
  });
});

test("masks the whole preview before clipping, even when the cut would bisect the canary", () => {
  const canary = "MADE_UP_CANARY_277";
  const preview = threadPreview({ kind: "message", text: `Found ${canary} today` }, {
    mask: (text) => text.replaceAll(canary, "••••"),
    maxLength: 12,
  });

  assert.deepEqual(preview, { text: "Found ••••…", kind: "message" });
  assert.ok(!preview.text.includes(canary));
});

test("masks card titles before Markdown removes characters from the canary", () => {
  const canary = "MADE**UP**CANARY";
  const preview = threadPreview({ kind: "chart", title: canary }, {
    mask: (text) => text.replaceAll(canary, "••••"),
  });
  assert.deepEqual(preview, { text: "Chart: ••••", kind: "chart" });
});

test("masks a canary formed when line breaks are flattened", () => {
  const preview = threadPreview({ kind: "message", text: "Found MADE UP\nCANARY" }, {
    mask: (text) => text.replaceAll("MADE UP CANARY", "••••"),
  });
  assert.deepEqual(preview, { text: "Found ••••", kind: "message" });
});

test("counts Hebrew letters with their vowel marks at the default limit", () => {
  const letter = "שָׁ";
  const text = letter.repeat(85);
  assert.deepEqual(threadPreview({ kind: "message", text }, options), {
    text: `${letter.repeat(79)}…`,
    kind: "message",
  });
});

test("preserves mixed Hebrew and English in their original order", () => {
  assert.deepEqual(threadPreview({ kind: "message", text: "שלום **Friday**\nעולם" }, options), {
    text: "שלום Friday עולם",
    kind: "message",
  });
});

test("clips at a whole emoji, counting the ellipsis in the limit", () => {
  for (const emoji of ["😀", "👩🏽‍💻"]) {
    const event = { kind: "message", text: `Go${emoji} now` };
    assert.equal(threadPreview(event, { ...options, maxLength: 4 }).text, `Go${emoji}…`);
    assert.equal(threadPreview(event, { ...options, maxLength: 3 }).text, "Go…");
  }
});

test("returns an empty preview for empty text, unknown kinds and null", () => {
  for (const event of [
    { kind: "message", text: "  \r\n" },
    { kind: "unknown", text: "Some text" },
    { kind: "artifact", title: "" },
    { kind: "tool_call", text: "Some text" },
    null,
  ]) {
    assert.deepEqual(threadPreview(event, options), empty);
  }
});

test("handles malformed events and fails closed if masking throws", () => {
  const event = { kind: "message", text: "Sample text" };
  assert.deepEqual(threadPreview({ kind: "message", text: 42 }, options), empty);
  assert.deepEqual(threadPreview(event, { mask() { throw new Error("Mask unavailable"); } }), empty);
  assert.deepEqual(threadPreview(event, { ...options, maxLength: 0 }), empty);
  assert.deepEqual(threadPreview(event, { ...options, maxLength: 1 }), { text: "…", kind: "message" });
});
