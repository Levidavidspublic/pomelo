import assert from "node:assert/strict";
import test from "node:test";
import { scanLogsForCanary } from "../src/pomelo/canary-logs.js";
import { canaryForms } from "../src/pomelo/canary-sweep.js";
import { canaryVerdict } from "../src/pomelo/canary-verdict.js";

const canary = ["fixture", '"\\/', "ÿÿÿ", "7f3a91"].join("-");
const escape = String.fromCharCode(27);

function assertSafeResult(value: string, result: ReturnType<typeof scanLogsForCanary>): void {
  const serialized = JSON.stringify(result);
  for (const { needle } of canaryForms(value)) {
    assert.ok(!serialized.includes(needle), "result excludes all canary forms");
  }
}

test("counts physical lines across clean captures", () => {
  assert.deepEqual(scanLogsForCanary(canary, {
    "server.log": "ready\nlistening\n",
    "browser.log": "starting\n\nfinished",
    "empty.log": "",
  }), { surface: "logs", ran: true, itemsScanned: 5, hitCount: 0, hitPlaces: [], forms: [] });
});

const bytes = Buffer.from(canary);
const encodings = [
  ["plain", canary],
  ["json", JSON.stringify(canary).slice(1, -1)],
  ["url", encodeURIComponent(canary)],
  ["base64", bytes.toString("base64")],
  ["base64url", bytes.toString("base64url")],
  ["hex", bytes.toString("hex")],
  ["hex", bytes.toString("hex").toUpperCase()],
] as const;

for (const [index, [form, value]] of encodings.entries()) {
  test(`reports encoding ${index + 1} on its one-based line`, () => {
    const result = scanLogsForCanary(canary, {
      "server.log": "ready",
      "browser.log": `starting\nvalue=${value}\nfinished`,
    });
    assertSafeResult(canary, result);
    assert.deepEqual(result, {
      surface: "logs", ran: true, itemsScanned: 4, hitCount: 1,
      hitPlaces: [{ file: "browser.log", line: 2 }], forms: [form],
    });
    assert.equal(canaryVerdict([result]).verdict, "leak");
  });
}

test("finds matches surrounded and interrupted by CSI and OSC sequences", () => {
  const left = canary.slice(0, 9);
  const right = canary.slice(9);
  const result = scanLogsForCanary(canary, {
    "server.log": [
      `${escape}[1;31m${canary}${escape}[0m`,
      `${left}${escape}[32m${right}`,
      `${left}${escape}]0;title\x07${right}`,
      `${left}${escape}]0;title${escape}\\${right}`,
    ].join("\n"),
  });
  assertSafeResult(canary, result);
  assert.equal(result.hitCount, 4);
  assert.deepEqual(result.hitPlaces, [1, 2, 3, 4].map((line) => ({ file: "server.log", line })));
  assert.deepEqual(result.forms, ["plain"]);
});

test("reports a wrapped match on the first line of its pair", () => {
  const left = canary.slice(0, 9);
  const right = canary.slice(9);
  for (const newline of ["\n", "\r\n"]) {
    const result = scanLogsForCanary(canary, {
      "browser.log": ["starting", `value=${left}${escape}[0m`, `${right} ready`, "finished"].join(newline),
    });
    assertSafeResult(canary, result);
    assert.equal(result.itemsScanned, 4);
    assert.equal(result.hitCount, 1);
    assert.deepEqual(result.hitPlaces, [{ file: "browser.log", line: 2 }]);
    assert.deepEqual(result.forms, ["plain"]);
  }
});

test("counts each matching line once and collects every matching form", () => {
  const hex = bytes.toString("hex");
  const result = scanLogsForCanary(canary, {
    "server.log": `ready\r\n${canary} ${canary} ${hex} ${hex.slice(0, 16)}\r\n${hex.slice(16)}\r\n${canary}\r\n`,
    "browser.log": `\r\n${canary}`,
  });
  assertSafeResult(canary, result);
  assert.equal(result.itemsScanned, 6);
  assert.equal(result.hitCount, 3);
  assert.deepEqual(result.hitPlaces, [
    { file: "server.log", line: 2 },
    { file: "server.log", line: 4 },
    { file: "browser.log", line: 2 },
  ]);
  assert.deepEqual([...result.forms].sort(), ["hex", "plain"]);
});

test("keeps a wrapped hit even if both of its lines also have standalone matches", () => {
  const hex = bytes.toString("hex");
  const result = scanLogsForCanary(canary, {
    "server.log": `${canary} ${hex.slice(0, 16)}\n${hex.slice(16)} ${canary}`,
  });
  assertSafeResult(canary, result);
  assert.equal(result.hitCount, 2);
  assert.deepEqual(result.hitPlaces, [{ file: "server.log", line: 1 }, { file: "server.log", line: 2 }]);
  assert.deepEqual([...result.forms].sort(), ["hex", "plain"]);
});

test("marks missing and empty captures as unrun", () => {
  for (const sources of [{}, { "server.log": "", "browser.log": "" }] as Record<string, string>[]) {
    assert.deepEqual(scanLogsForCanary(canary, sources), {
      surface: "logs", ran: false, itemsScanned: 0, hitCount: 0, hitPlaces: [], forms: [],
    });
  }
});

test("omits source names containing any canary form", () => {
  const needles = canaryForms(canary);
  const result = scanLogsForCanary(canary, Object.fromEntries(
    needles.map(({ needle }) => [`capture-${needle}.log`, canary]),
  ));
  assertSafeResult(canary, result);
  assert.equal(result.hitCount, needles.length);
  assert.deepEqual(result.hitPlaces, needles.map(() => ({ file: "[name omitted]", line: 1 })));
});

test("omits a name that would reveal the canary when serialized", () => {
  const name = ['fixture', '"end'].join("");
  const escapedCanary = JSON.stringify(name).slice(1, -1);
  const result = scanLogsForCanary(escapedCanary, { [name]: escapedCanary });
  assertSafeResult(escapedCanary, result);
  assert.deepEqual(result.hitPlaces, [{ file: "[name omitted]", line: 1 }]);
});

test("uses an empty label if the omission marker itself contains the canary", () => {
  const markerCanary = ["name", "omitted"].join(" ");
  const result = scanLogsForCanary(markerCanary, { [markerCanary]: markerCanary });
  assertSafeResult(markerCanary, result);
  assert.deepEqual(result.hitPlaces, [{ file: "", line: 1 }]);
});

test("rejects a short canary with the shared validation error", () => {
  const short = ["fix", "ture"].join("");
  assert.throws(() => scanLogsForCanary(short, {}), { message: "Canary must be at least 8 characters" });
});
