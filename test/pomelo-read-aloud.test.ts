import assert from "node:assert/strict";
import test from "node:test";
import { speakable } from "../src/client/pomelo/read-aloud.js";

const spoken = (markdown: string) => speakable(markdown).map(({ text }) => text).join(" ");

test("headings, emphasis, quotes and list marks leave their words", () => {
  const markdown = [
    "# Ready to ship",
    "",
    "> **All checks** pass.",
    "- Review the *summary*.",
    "  1. Keep the _notes_ and the `test_file` name.",
    "  2. [x] Save the report.",
  ].join("\n");

  assert.equal(spoken(markdown), "Ready to ship All checks pass. Review the summary. Keep the notes and the test_file name. Save the report.");
});

test("a fenced code block becomes one note counting only its content lines", () => {
  const code = Array.from({ length: 12 }, (_, i) => `  sample(${i});`);
  const markdown = ["Done.", "```ts", ...code, "```", "Next step."].join("\n");

  assert.equal(spoken(markdown), "Done. Code block, 12 lines. Next step.");
  assert.equal(spoken("~~~~ts\r\n~~~\r\nexample()\r\n~~~~\r\nDone."), "Code block, 2 lines. Done.");
  assert.equal(spoken("Done.\n```ts\nexample()\n"), "Done. Code block, 1 line.");
});

test("a table becomes one note counting the header and data rows", () => {
  const markdown = [
    "Results are ready.",
    "",
    "Item | Status",
    ":--- | ---:",
    "First | Pass",
    "Second | Pass",
    "Continue with the summary.",
  ].join("\n");

  assert.equal(spoken(markdown), "Results are ready. Table, 3 rows. Continue with the summary.");
  assert.equal(spoken("Keep left | right."), "Keep left | right.");
});

test("links speak their label and bare web URLs speak their hostname", (t) => {
  if (typeof URL.parse === "function") {
    t.mock.method(URL, "parse", () => { throw new Error("URL.parse is unavailable"); });
  }
  const markdown = 'Read [the **guide**](https://example.com/path_(draft) "A title"). Then see (https://example.org/docs?q=1#part).';

  assert.equal(spoken(markdown), "Read the guide. Then see (example.org).");
  assert.equal(spoken("See <https://example.net/path> or www.example.org/path."), "See example.net or www.example.org.");
});

test("inline math and HTML tags are dropped while nearby prose stays", () => {
  const markdown = String.raw`The <strong title="a > b">result</strong> $x + y$ is ready. Compare \(a^2\) with $$b^2$$ today.`;

  assert.equal(spoken(markdown), "The result is ready. Compare with today.");
  assert.equal(spoken("Prices went from $5 to $10."), "Prices went from $5 to $10.");
  assert.equal(spoken("First<br>second."), "First second.");
});

test("inline code keeps literal HTML-like text and math symbols", () => {
  const markdown = '**Use `Array<string>`** with [`$x$`](https://example.com). Keep `**literal**` as written.';

  assert.equal(spoken(markdown), "Use Array<string> with $x$. Keep **literal** as written.");
});

test("empty or whitespace-only messages have no chunks", () => {
  assert.deepEqual(speakable(""), []);
  assert.deepEqual(speakable(" \t\r\n "), []);
  assert.deepEqual(speakable("<br> $x^2$"), []);
});

test("the verdict is the first chunk and longer sentences break between words", () => {
  const details = `Details follow ${"with several words ".repeat(35)}over several chunks.`;
  const chunks = speakable(`**Ready to ship.** ${details} This is the last sentence.`);

  assert.equal(chunks[0]?.text, "Ready to ship.");
  assert.ok(chunks.length > 3);
  assert.ok(chunks.every(({ text }) => text.length <= 200 && text === text.trim()));
  assert.equal(chunks.map(({ text }) => text).join(" "), `Ready to ship. ${details} This is the last sentence.`);
});

test("an unpunctuated heading stays separate from the body", () => {
  assert.deepEqual(speakable("# Ready to ship\n\nAll checks pass."), [
    { text: "Ready to ship", lang: "en" },
    { text: "All checks pass.", lang: "en" },
  ]);
});

test("unpunctuated list items stay in separate chunks", () => {
  assert.deepEqual(speakable("- Ready to ship\n- All checks pass\n- Review the summary. Save the report."), [
    { text: "Ready to ship", lang: "en" },
    { text: "All checks pass", lang: "en" },
    { text: "Review the summary.", lang: "en" },
    { text: "Save the report.", lang: "en" },
  ]);
});

test("a single word over the chunk limit is replaced with a spoken note", () => {
  const chunks = speakable("Done. Before " + "x".repeat(201) + " after.");

  assert.deepEqual(chunks.map(({ text }) => text), ["Done.", "Before", "Long word omitted.", "after."]);
});

test("the first letter gives the language hint in mixed text", () => {
  assert.deepEqual(speakable("שלום עולם! Hello world! (123) שלום team! ✨ Ready עכשיו!"), [
    { text: "שלום עולם!", lang: "he" },
    { text: "Hello world!", lang: "en" },
    { text: "(123) שלום team!", lang: "he" },
    { text: "✨ Ready עכשיו!", lang: "en" },
  ]);
});

test("the chunk list and each chunk are frozen", () => {
  const chunks = speakable("Done. Continue.");

  assert.ok(Object.isFrozen(chunks));
  assert.ok(chunks.every(Object.isFrozen));
  assert.ok(Object.isFrozen(speakable("")));
});
