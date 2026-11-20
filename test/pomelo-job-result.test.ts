import assert from "node:assert/strict";
import test from "node:test";
import { cleanJobResult } from "../src/pomelo/browser/job-result.js";
import { sweepForCanary } from "../src/pomelo/canary-sweep.js";
import { MASK } from "../src/pomelo/mask.js";
import { HIDDEN } from "../src/secrets.js";

const canary = ["pomelo-canary", '7f"3\\a', "ÿÿÿ", "91c2e5"].join("-");
const noCut = { rows: 0, chars: 0 };

test("small text and a three-column table come back unchanged", () => {
  const text = { kind: "text", text: " Three offers found. " };
  const table = { kind: "table", columns: ["Item", "Price", "In stock"], rows: [["Orange", 3, true], ["Lemon", 2, false]] };
  for (const input of [text, table]) {
    assert.deepEqual(cleanJobResult(input), { ok: true, result: input, cut: noCut });
  }
});

test("Friday hides secret-shaped strings in text, column names and cells", () => {
  const prefix = "gh" + "p_";
  const shaped = prefix + "sample0".repeat(6);
  const hidden = `${prefix}…${HIDDEN}`;
  assert.deepEqual(cleanJobResult({ kind: "text", text: `Read ${shaped}` }), {
    ok: true, result: { kind: "text", text: `Read ${hidden}` }, cut: noCut,
  });
  const table = Object.freeze({ kind: "table", columns: Object.freeze([shaped]), rows: Object.freeze([Object.freeze([shaped])]) });
  assert.deepEqual(cleanJobResult(table), {
    ok: true, result: { kind: "table", columns: [hidden], rows: [[hidden]] }, cut: noCut,
  });
  assert.equal(table.rows[0][0], shaped);
});

test("strings containing the browser mask keep only the marker", () => {
  const input = { kind: "table", columns: ["Value"], rows: [[MASK], [`${MASK} sample value`]] };
  assert.deepEqual(cleanJobResult(input), {
    ok: true, result: { ...input, rows: [[MASK], [MASK]] }, cut: noCut,
  });
  assert.deepEqual(cleanJobResult({ kind: "text", text: `sample value ${MASK}` }), {
    ok: true, result: { kind: "text", text: MASK }, cut: noCut,
  });
});

test("explicit cookie and password labels hide values without a recognizable token shape", () => {
  for (const text of ["Cookie: sample=abc; other=xyz", '"set-cookie": "sample=abc"', "password=abc"]) {
    assert.deepEqual(cleanJobResult({ kind: "text", text }), {
      ok: true, result: { kind: "text", text: HIDDEN }, cut: noCut,
    });
  }
  const table = { kind: "table", columns: ["Item", "Cookie", "Password"], rows: [["Orange", "sample=abc", 1234]] };
  assert.deepEqual(cleanJobResult(table), {
    ok: true, result: { ...table, rows: [["Orange", HIDDEN, HIDDEN]] }, cut: noCut,
  });
});

test("the row cap drops a suffix of whole rows and reports the omission", () => {
  const input = { kind: "table", columns: ["Item", "Price"], rows: [["Orange", 3], ["Lemon", 2], ["Pear", 4]] };
  const output = cleanJobResult(input, { maxRows: 1 });
  assert.ok(output.ok);
  assert.deepEqual(output.result, { ...input, rows: [["Orange", 3]] });
  assert.equal(output.cut.rows, 2);
  assert.match(output.note ?? "", /2 rows/);
});

test("the character cap drops complete rows, including small rows after a large one", () => {
  const prefix = { kind: "table", columns: ["Item"], rows: [["🍊"]] };
  const input = { ...prefix, rows: [...prefix.rows, ['"'.repeat(100)], ["a"]] };
  const maxChars = [...JSON.stringify(prefix)].length;
  const chars = [...JSON.stringify(input)].length - maxChars;
  assert.deepEqual(cleanJobResult(input, { maxChars }), {
    ok: true, result: prefix, cut: { rows: 2, chars }, note: `2 rows and ${chars} characters omitted.`,
  });
  assert.equal(cleanJobResult(input, { maxChars: 1 }).ok, false);
});

test("text is cut at a whole Hebrew or emoji character, including combined characters", () => {
  for (const [head, tail, maxChars] of [
    ["שלום 🍊", " בית", 6],
    ["שָ", "🍊xyz", 2],
    ["א", "👩‍💻xyz", 3],
  ] as const) {
    const chars = [...tail].length;
    assert.deepEqual(cleanJobResult({ kind: "text", text: head + tail }, { maxChars }), {
      ok: true, result: { kind: "text", text: head }, cut: { rows: 0, chars },
      note: `${chars} characters omitted.`,
    });
  }
});

test("a cutoff leaves either a complete mask marker or none of it", () => {
  for (const marker of [MASK, HIDDEN]) {
    const input = { kind: "text", text: marker };
    assert.deepEqual(cleanJobResult(input, { maxChars: marker.length }), { ok: true, result: input, cut: noCut });
    assert.deepEqual(cleanJobResult(input, { maxChars: marker.length - 1 }), {
      ok: true, result: { kind: "text", text: "" }, cut: { rows: 0, chars: marker.length },
      note: `${marker.length} characters omitted.`,
    });
  }
  assert.deepEqual(cleanJobResult({ kind: "text", text: `Item ${HIDDEN} found` }, { maxChars: 10 }), {
    ok: true, result: { kind: "text", text: "Item " }, cut: { rows: 0, chars: HIDDEN.length + 6 },
    note: `${HIDDEN.length + 6} characters omitted.`,
  });
});

test("invalid shapes are refused even when the bad row would be cut", () => {
  const invalid = [
    { kind: "text", text: "" },
    { kind: "text", text: " \n\t" },
    { kind: "text", text: 5 },
    { kind: "table", columns: ["Item"], rows: [] },
    { kind: "table", columns: [], rows: [[]] },
    { kind: "table", columns: ["Item"], rows: [["Orange"], ["Extra", "Cell"]] },
    { kind: "table", columns: ["Item"], rows: [["Orange"], []] },
    { kind: "table", columns: ["Item"], rows: [[{ value: "Orange" }]] },
    { kind: "table", columns: ["Item"], rows: [new Array(1)] },
    42,
    null,
    { kind: "image" },
  ];
  for (const input of invalid) {
    const result = cleanJobResult(input, { maxRows: 1 });
    assert.equal(result.ok, false);
  }
  assert.equal(cleanJobResult({ kind: "table", columns: ["Item", "Price"], rows: [["Orange", 3]] }, { maxColumns: 1 }).ok, false);
});

test("the serialized success and refusal shapes have zero canary hits", () => {
  const bytes = Buffer.from(canary);
  const forms = [
    canary, encodeURIComponent(canary), bytes.toString("base64"), bytes.toString("hex"),
    JSON.stringify(canary).slice(1, -1), Buffer.from(`x${canary}suffix`).toString("base64url"),
  ];
  const options = { knownSecrets: [canary] };
  const table = cleanJobResult({ kind: "table", columns: forms, rows: [forms] }, options);
  assert.ok(table.ok);
  assert.deepEqual(sweepForCanary(canary, { table: JSON.stringify(table) }), []);
  for (const form of forms) {
    const text = cleanJobResult({ kind: "text", text: `Sample ${form}` }, options);
    const refused = cleanJobResult({ kind: form, text: form }, options);
    const badRow = cleanJobResult({ kind: "table", columns: [form], rows: [[form, form]] }, options);
    assert.ok(text.ok);
    assert.equal(refused.ok, false);
    assert.equal(badRow.ok, false);
    assert.deepEqual(sweepForCanary(canary, {
      text: JSON.stringify(text), refused: JSON.stringify(refused), badRow: JSON.stringify(badRow),
    }), []);
  }
});

test("known secrets shorter than the canary minimum are also hidden", () => {
  const knownSecrets = ["a+3"];
  const text = Buffer.from(knownSecrets[0]).toString("base64");
  assert.deepEqual(cleanJobResult({ kind: "text", text }, { knownSecrets }), {
    ok: true, result: { kind: "text", text: HIDDEN }, cut: noCut,
  });
});
