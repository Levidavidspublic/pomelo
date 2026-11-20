import assert from "node:assert/strict";
import test from "node:test";
import { copyTextFor, type CopyPart } from "../src/client/pomelo/message-copy.js";

const modes = ["plain", "markdown"] as const;

test("plain copy flattens headings, emphasis, and links", () => {
  const markdown = "# **Ready**\n\nRead *the notes* and [_the guide_](https://example.test/guide).";

  assert.deepEqual(copyTextFor([{ kind: "text", markdown }], "plain"), {
    text: "Ready\n\nRead the notes and the guide (https://example.test/guide).\n",
    cards: 0,
  });
});

test("markdown copy preserves formatting and line breaks", () => {
  const markdown = "  ## **Ready**  \r\n\r\n*See* [the notes](https://example.test/notes).  \r\n";

  assert.deepEqual(copyTextFor([{ kind: "text", markdown }], "markdown"), { text: markdown, cards: 0 });
});

test("plain copy preserves literal inline code and link addresses", () => {
  const markdown = 'Plan\n----\nUse **`**sample**`** and [the *guide*](https://example.test/_guide_(draft) "Draft"). See [the next page](path`sample`).';

  assert.equal(copyTextFor([{ kind: "text", markdown }], "plain").text,
    "Plan\nUse `**sample**` and the guide (https://example.test/_guide_(draft)). See the next page (path`sample`).\n");
});

test("both modes preserve fenced code, including shorter fences and blank lines", () => {
  const code = ["  ````ts  ", "  **sample**  ", "```", "", " ", "", "", "\t# still code", "  ```` \t"].join("\r\n");
  const tildeCode = "~~~text\n# **sample**\n~~~";
  const markdown = `# Example\n${code}\r\n${tildeCode}\n**After**`;

  assert.equal(copyTextFor([{ kind: "text", markdown }], "plain").text, `Example\n${code}\r\n${tildeCode}\nAfter\n`);
  assert.equal(copyTextFor([{ kind: "text", markdown }], "markdown").text, `${markdown}\n`);
});

test("quoted, listed, and indented code retain their original punctuation and whitespace", () => {
  const code = "> ```\n> **quoted**\n> ```\n\n- ~~~\n  **listed**\n  ~~~\n\n    **indented**\n\n\n\n\n    # still code";
  const markdown = `${code}\n\n**After**`;

  assert.equal(copyTextFor([{ kind: "text", markdown }], "plain").text, `${code}\n\nAfter\n`);
  assert.equal(copyTextFor([{ kind: "text", markdown }], "markdown").text, `${markdown}\n`);
});

test("all five kinds copy just one title line, in message order", () => {
  const omitted = "omitted fixture marker";
  const parts = [
    { kind: "text", markdown: "First\n" },
    { kind: "card", cardKind: "diagram", title: "Flow", source: omitted },
    { kind: "card", cardKind: "artifact", title: "Draft", body: omitted },
    { kind: "text", markdown: "Then" },
    { kind: "card", cardKind: "image", title: "Preview\r\n   image", src: omitted },
    { kind: "card", cardKind: "chart", title: "Totals", data: omitted },
    { kind: "card", cardKind: "widget", title: "Filter", note: omitted },
  ] as const;
  const expected = "First\n[diagram: Flow]\n[artifact: Draft]\nThen\n[image: Preview image]\n[chart: Totals]\n[widget: Filter]\n";

  for (const mode of modes) assert.deepEqual(copyTextFor(parts, mode), { text: expected, cards: 5 });
});

test("an empty title uses its kind's fallback after invisible characters are removed", () => {
  const parts: readonly CopyPart[] = [
    { kind: "card", cardKind: "diagram", title: "" },
    { kind: "card", cardKind: "artifact", title: " \t " },
    { kind: "card", cardKind: "image", title: "\u200B" },
    { kind: "card", cardKind: "chart", title: "" },
    { kind: "card", cardKind: "widget", title: "" },
  ];

  assert.deepEqual(copyTextFor(parts, "plain"), {
    text: "[diagram: Diagram]\n[artifact: Artifact]\n[image: Image]\n[chart: Chart]\n[widget: Widget]\n",
    cards: 5,
  });
});

test("both modes strip hidden controls and preserve Hebrew marks and the mask marker", () => {
  const parts: readonly CopyPart[] = [
    { kind: "text", markdown: "שָׁ\u202Eלוֹם\u200C ••••\u2060" },
    { kind: "card", cardKind: "diagram", title: "תַּ\u2067רְשִׁים\u2069 ••••" },
  ];

  for (const mode of modes) assert.deepEqual(copyTextFor(parts, mode), {
    text: "שָׁלוֹם ••••\n[diagram: תַּרְשִׁים ••••]\n",
    cards: 1,
  });
});

test("invisible controls inside a fence are removed while visible code is preserved", () => {
  const markdown = "```\n``\u202E`\n  **re\u202Esult** = '••••'\u200D  \n```";

  for (const mode of modes) assert.equal(copyTextFor([{ kind: "text", markdown }], mode).text,
    "```\n```\n  **result** = '••••'  \n```\n");
});

test("both modes collapse runs of at least three blank lines and end with one newline", () => {
  const markdown = "First\n\n \t\n\n\nSecond\n\n\nThird\n\n\n";

  for (const mode of modes) assert.equal(copyTextFor([{ kind: "text", markdown }], mode).text, "First\n\nSecond\n\n\nThird\n");
});

test("an empty message has no text or cards", () => {
  for (const mode of modes) {
    assert.deepEqual(copyTextFor([], mode), { text: "", cards: 0 });
    assert.deepEqual(copyTextFor([{ kind: "text", markdown: "" }], mode), { text: "", cards: 0 });
  }
});
