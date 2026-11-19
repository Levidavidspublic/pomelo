import assert from "node:assert/strict";
import test from "node:test";
import { cleanTagName, matchTagName } from "../src/pomelo/tag-name.js";

test("tag keys ignore case, surrounding spaces and separator differences", () => {
  for (const [raw, label] of [
    ["Pomelo", "Pomelo"], [" pomelo ", "pomelo"], ["POMELO", "POMELO"],
    ["-pomelo", "-pomelo"], ["pomelo_", "pomelo_"],
  ]) {
    assert.deepEqual(cleanTagName(raw), { ok: true, label, key: "pomelo" });
  }
  for (const label of ["tempo flow", "tempo-flow", "Tempo_Flow", "Tempo -_ Flow"]) {
    assert.deepEqual(cleanTagName(label), { ok: true, label, key: "tempo-flow" });
  }
  for (const raw of ["tempo\tflow", "tempo\nflow"]) {
    assert.deepEqual(cleanTagName(raw), { ok: true, label: "tempo flow", key: "tempo-flow" });
  }
});

test("tag names preserve Hebrew letters, vowel marks and mixed text", () => {
  const label = "שָׁלוֹם עולם";
  assert.deepEqual(cleanTagName("  שָׁלוֹם   עולם  "), { ok: true, label, key: "שָׁלוֹם-עולם" });
  assert.deepEqual(matchTagName("  שָׁלוֹם   עולם  ", [{ slug: "hello", label }]), {
    kind: "existing", slug: "hello",
  });
  assert.deepEqual(cleanTagName("  Pomelo   שלום  "), {
    ok: true, label: "Pomelo שלום", key: "pomelo-שלום",
  });
});

test("tag names remove formatting and control characters and use NFC", () => {
  assert.deepEqual(cleanTagName("  Cafe\u200B\u0301\u202E\u0000\u00A0  Notes  "), {
    ok: true, label: "Café Notes", key: "café-notes",
  });
});

test("tag names keep a whole emoji at the 40 character limit", () => {
  const start = "Pomelo ".repeat(5) + "work";
  const label = start + "🍊";
  const raw = label + " plan".repeat(4);
  assert.equal([...raw].length, 60);
  assert.equal([...label].length, 40);
  assert.deepEqual(cleanTagName(raw), { ok: true, label, key: "pomelo-".repeat(5) + "work🍊" });
});

test("tag names discard combining marks without a base", () => {
  const start = "Pomelo ".repeat(5) + "work";
  assert.deepEqual(cleanTagName("\u05B0" + start + " \u05B0Next"), {
    ok: true, label: start, key: "pomelo-".repeat(5) + "work",
  });
  assert.deepEqual(cleanTagName("שָ\u05C1"), { ok: true, label: "שָׁ", key: "שָׁ" });
});

test("tag names refuse empty or non-text inputs", () => {
  for (const raw of ["", "   ", "\u200B\u202E", "\u05B0", "-", "_", "- _"]) {
    assert.deepEqual(cleanTagName(raw), { ok: false, reason: "empty" });
  }
  assert.deepEqual(cleanTagName(324), { ok: false, reason: "not-text" });
  assert.deepEqual(matchTagName("", []), { kind: "refused", reason: "empty" });
  assert.deepEqual(matchTagName("-", [{ slug: "separator", label: "_" }]), {
    kind: "refused", reason: "empty",
  });
});

test("tag names refuse token-shaped inputs without returning the supplied text", () => {
  const sample = "demo" + "A1".repeat(8);
  for (const raw of [
    sample, "notes " + sample, sample + "_x", "notes ".repeat(5) + sample,
    "s\u200Bk" + "-demo", "ghp" + "_demo", "op" + "://demo",
  ]) {
    assert.deepEqual(cleanTagName(raw), { ok: false, reason: "looks-secret" });
    assert.deepEqual(matchTagName(raw, []), { kind: "refused", reason: "looks-secret" });
  }
  assert.deepEqual(cleanTagName(sample.slice(1)), {
    ok: true, label: sample.slice(1), key: sample.slice(1).toLowerCase(),
  });
});

test("tag matching uses the saved label and returns the saved slug", () => {
  const tags = [{ slug: "original-slug", label: " Tempo_Flow " }];
  assert.deepEqual(matchTagName("TEMPO FLOW", tags), { kind: "existing", slug: "original-slug" });
  assert.deepEqual(matchTagName("  New Tag  ", tags), { kind: "new", label: "New Tag", key: "new-tag" });
});

test("tag matching ignores malformed existing tags", () => {
  const expected = { kind: "new", label: "Pomelo", key: "pomelo" };
  for (const existing of [null, { slug: "saved", label: "Pomelo" }, [null, { slug: "saved" }, { label: "Pomelo" }]]) {
    assert.deepEqual(matchTagName("Pomelo", existing), expected);
  }
  assert.deepEqual(matchTagName("Pomelo", [null, { slug: "saved", label: "POMELO" }]), {
    kind: "existing", slug: "saved",
  });
});
