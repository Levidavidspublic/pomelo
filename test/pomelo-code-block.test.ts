import assert from "node:assert/strict";
import test from "node:test";
import { CODE_BLOCK_FOLD_LIMIT, codeBlockModel, unfoldCodeBlock, withCopyResult } from "../src/client/pomelo/code-block.js";
import { textDirection } from "../src/client/pomelo/text-direction.js";

test("code stays left to right inside a Hebrew reply", () => {
  const text = "// שלום\nconst total = 2;";
  const reply = `הנה דוגמה:\n\n\`\`\`ts\n${text}\n\`\`\``;

  assert.equal(textDirection(reply), "rtl");
  assert.equal(codeBlockModel({ text, info: "ts" }).dir, "ltr");
});

test("known languages get short labels", () => {
  assert.equal(codeBlockModel({ text: "", info: "ts" }).languageLabel, "TypeScript");
  assert.equal(codeBlockModel({ text: "", info: " TypeScript " }).languageLabel, "TypeScript");
  assert.equal(codeBlockModel({ text: "", info: "C++" }).languageLabel, "C++");
});

test("unknown, overlong, and unsafe info strings fall back to code", () => {
  for (const info of [undefined, "unknown", "ts" + " ".repeat(100), "ts <b>", "ts\u0000", "ts\n", "\tts", "ts\u202e", "constructor"]) {
    assert.equal(codeBlockModel({ text: "", info }).languageLabel, "code");
  }
});

test("copy keeps the exact code body with LF line endings", () => {
  const text = "  first  \r\n\r\n\tsecond\rthird";
  const expected = "  first  \n\n\tsecond\nthird";
  const model = codeBlockModel({ text, info: "ts" });

  assert.deepEqual(model.copy, { enabled: true, label: "copy", text: expected });
  assert.equal(model.visibleText, expected);
  assert.equal(model.lineCount, 4);
});

test("copy preserves fence-like code and an existing final newline", () => {
  const model = codeBlockModel({ text: "````\r\n```\r\n" });

  assert.equal(model.copy.text, "````\n```\n");
  assert.equal(model.lineCount, 2);
});

test("the fold limit is open and the next line triggers a preview", () => {
  const preview = Array.from({ length: CODE_BLOCK_FOLD_LIMIT }, (_, index) => `// line ${index + 1}`).join("\n");
  const atLimit = codeBlockModel({ text: `${preview}\n` });
  assert.equal(atLimit.lineCount, CODE_BLOCK_FOLD_LIMIT);
  assert.equal(atLimit.folded, false);
  assert.equal(atLimit.visibleText, `${preview}\n`);
  assert.equal(atLimit.showAllLabel, null);

  const text = `${preview}\n// last line`;
  const overLimit = codeBlockModel({ text });
  assert.equal(overLimit.lineCount, CODE_BLOCK_FOLD_LIMIT + 1);
  assert.equal(overLimit.folded, true);
  assert.equal(overLimit.visibleText, preview);
  assert.equal(overLimit.showAllLabel, `show all ${CODE_BLOCK_FOLD_LIMIT + 1} lines`);
  assert.equal(overLimit.copy.text, text);

  const unfolded = unfoldCodeBlock(overLimit);
  assert.equal(unfolded.folded, false);
  assert.equal(unfolded.visibleText, text);
  assert.equal(unfolded.showAllLabel, null);
  assert.strictEqual(unfoldCodeBlock(unfolded), unfolded);
  assert.equal(overLimit.folded, true);
});

test("copy feedback reflects success, reset, and failure", () => {
  const model = codeBlockModel({ text: "value" });
  const copied = withCopyResult(model, "success");

  assert.equal(model.copy.label, "copy");
  assert.equal(copied.copy.label, "copied");
  assert.deepEqual(withCopyResult(copied, "reset"), model);
  assert.deepEqual(withCopyResult(model, "failure").copy, { enabled: true, label: "could not copy", text: "value" });
});

test("an empty block has zero lines and copy is disabled", () => {
  const model = codeBlockModel({ text: "" });

  assert.equal(model.lineCount, 0);
  assert.equal(model.folded, false);
  assert.deepEqual(model.copy, { enabled: false, label: "copy", text: "" });
  assert.strictEqual(withCopyResult(model, "success"), model);
});
