import assert from "node:assert/strict";
import test from "node:test";
import { cleanJobResult } from "../src/pomelo/browser/job-result.js";
import { sweepForCanary } from "../src/pomelo/canary-sweep.js";
import { MASK } from "../src/pomelo/mask.js";
import { HIDDEN } from "../src/secrets.js";

const canary = ["pomelo-canary", '7f"3\\a', "ÿÿÿ", "91c2e5"].join("-");
const noCut = { rows: 0, chars: 0 };
const invalidResult = {
  ok: false, code: "invalid-result", message: "The job must return nonempty text or a table with valid rows.",
};

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
    ok: true, result: { ...input, rows: [[MASK], [MASK]] }, cut: noCut, note: "1 value hidden.",
  });
  assert.deepEqual(cleanJobResult({ kind: "text", text: `sample value ${MASK}` }), {
    ok: true, result: { kind: "text", text: MASK }, cut: noCut, note: "1 value hidden.",
  });
});

test("cookie and password assignments hide values and preserve surrounding findings", () => {
  for (const [raw, cleaned] of [
    ["Offer found. Cookie: sample=abc; other=xyz\nPrice: 3", `Offer found. Cookie: ${HIDDEN}\nPrice: 3`],
    ['"set-cookie": "sample=abc"', `"set-cookie": "${HIDDEN}"`],
    ["Offer found. Cookie=sample=abc; other=xyz", `Offer found. Cookie=${HIDDEN}`],
    ["Price: 3, password=abc, in stock", `Price: 3, password=${HIDDEN}, in stock`],
    ['Password: "abc def", Price: 3', `Password: ${HIDDEN}, Price: 3`],
    ["Password: abc\nPrice: 3", `Password: ${HIDDEN}\nPrice: 3`],
    ["Cookies: see the policy. Password: required for checkout.", "Cookies: see the policy. Password: required for checkout."],
  ]) {
    const text = `Findings\n${raw}\nEnd of findings`;
    assert.deepEqual(cleanJobResult({ kind: "text", text }), {
      ok: true, result: { kind: "text", text: `Findings\n${cleaned}\nEnd of findings` }, cut: noCut,
    });
  }
  const table = { kind: "table", columns: ["Item", "Cookie", "Password"], rows: [["Orange", "sample=abc", 1234]] };
  assert.deepEqual(cleanJobResult(table), {
    ok: true, result: { ...table, rows: [["Orange", HIDDEN, HIDDEN]] }, cut: noCut, note: "2 values hidden.",
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
  assert.deepEqual(cleanJobResult(input, { maxChars: 1 }), {
    ok: false, code: "headers-too-large", message: "The job table headers exceed the size limit.",
  });
  assert.deepEqual(cleanJobResult(input, { maxChars: [...JSON.stringify({ ...input, rows: [] })].length }), invalidResult);
  assert.deepEqual(cleanJobResult(input, { maxRows: 0 }), invalidResult);
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
    assert.deepEqual(cleanJobResult(input, { maxChars: marker.length - 1 }), invalidResult);
  }
  assert.deepEqual(cleanJobResult({ kind: "text", text: "abcd" }, { maxChars: 0 }), invalidResult);
  assert.deepEqual(cleanJobResult({ kind: "text", text: "  abcd" }, { maxChars: 2 }), invalidResult);
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
    assert.deepEqual(cleanJobResult(input, { maxRows: 1 }), invalidResult);
  }
  assert.deepEqual(cleanJobResult({ kind: "table", columns: ["Item", "Price"], rows: [["Orange", 3]] }, { maxColumns: 1 }), {
    ok: false, code: "too-many-columns", message: "The job table has too many columns.",
  });
});

test("the serialized success and refusal shapes have zero canary hits", () => {
  const bytes = Buffer.from(canary);
  const forms = [
    canary, encodeURIComponent(canary), bytes.toString("base64"), bytes.toString("hex"), bytes.toString("hex").toUpperCase(),
    JSON.stringify(canary).slice(1, -1), Buffer.from(`x${canary}suffix`).toString("base64url"),
  ];
  const options = { knownSecrets: [canary] };
  const table = cleanJobResult({ kind: "table", columns: forms, rows: [forms] }, options);
  const hidden = forms.map(() => HIDDEN);
  assert.deepEqual(table, {
    ok: true, result: { kind: "table", columns: hidden, rows: [hidden] }, cut: noCut,
    note: `${forms.length * 2} values hidden.`,
  });
  assert.deepEqual(sweepForCanary(canary, { table: JSON.stringify(table) }), []);
  for (const form of forms) {
    assert.ok(sweepForCanary(canary, { fixture: form }).length > 0);
    const text = cleanJobResult({ kind: "text", text: `Sample ${form}` }, options);
    const refused = cleanJobResult({ kind: form, text: form }, options);
    const badRow = cleanJobResult({ kind: "table", columns: [form], rows: [[form, form]] }, options);
    assert.deepEqual(text, {
      ok: true, result: { kind: "text", text: HIDDEN }, cut: noCut, note: "1 value hidden.",
    });
    assert.deepEqual(refused, invalidResult);
    assert.deepEqual(badRow, invalidResult);
    assert.deepEqual(sweepForCanary(canary, {
      text: JSON.stringify(text), refused: JSON.stringify(refused), badRow: JSON.stringify(badRow),
    }), []);
  }
});

test("known secrets shorter than the canary minimum are also hidden", () => {
  const knownSecrets = ["a+3"];
  const text = Buffer.from(knownSecrets[0]).toString("base64");
  assert.deepEqual(cleanJobResult({ kind: "text", text }, { knownSecrets }), {
    ok: true, result: { kind: "text", text: HIDDEN }, cut: noCut, note: "1 value hidden.",
  });
});
