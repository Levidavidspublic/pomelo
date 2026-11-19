import assert from "node:assert/strict";
import test from "node:test";
import { scanEventsForCanary } from "../src/pomelo/canary-events.js";
import { canaryForms } from "../src/pomelo/canary-sweep.js";

const canary = ["fixture", '"\\/', "ÿÿÿ", "orange"].join("-");

test("returns no hits or skips for clean messages and events", () => {
  assert.deepEqual(scanEventsForCanary(canary, {
    modelInput: [{ content: [{ text: "ready" }, { text: "{unfinished" }] }],
    busEvents: [{ kind: "event", event: { ready: true, note: null } }],
  }), { hits: [], skipped: [] });
});

test("names the model message index and nested field and leaves the input unchanged", () => {
  const content = Object.freeze([
    Object.freeze({ text: "ready" }),
    Object.freeze({ text: "waiting" }),
    Object.freeze({ text: `value=${canary}` }),
  ]);
  const input = Object.freeze({
    modelInput: Object.freeze([Object.freeze({ content: [] }), Object.freeze({ content })]),
    busEvents: Object.freeze([Object.freeze({ kind: "delta", text: "done" })]),
  });
  const before = JSON.stringify(input);
  assert.deepEqual(scanEventsForCanary(canary, input), {
    hits: [{ list: "model", index: 1, path: "content[2].text", form: "plain" }],
    skipped: [],
  });
  assert.ok(JSON.stringify(input) === before, "scan preserves the input");
});

test("names each encoded form on the bus", () => {
  const bytes = Buffer.from(canary);
  assert.deepEqual(scanEventsForCanary(canary, {
    modelInput: [],
    busEvents: [{ event: {
      json: `value=${JSON.stringify(canary)}`,
      url: encodeURIComponent(canary),
      base64: Buffer.from(`x${canary}y`).toString("base64"),
      base64url: bytes.toString("base64url"),
      hex: bytes.toString("hex"),
      upperHex: bytes.toString("hex").toUpperCase(),
    } }],
  }), {
    hits: [
      { list: "bus", index: 0, path: "event.json", form: "json" },
      { list: "bus", index: 0, path: "event.url", form: "url" },
      { list: "bus", index: 0, path: "event.base64", form: "base64" },
      { list: "bus", index: 0, path: "event.base64url", form: "base64url" },
      { list: "bus", index: 0, path: "event.hex", form: "hex" },
      { list: "bus", index: 0, path: "event.upperHex", form: "hex" },
    ],
    skipped: [],
  });
});

test("finds raw and decoded hits through nested JSON strings", () => {
  const payload = JSON.stringify({ records: JSON.stringify([{ text: canary }]) });
  assert.deepEqual(scanEventsForCanary(canary, {
    modelInput: [],
    busEvents: [{ payload }],
  }), {
    hits: [
      { list: "bus", index: 0, path: "payload.records", form: "json" },
      { list: "bus", index: 0, path: "payload.records[0].text", form: "plain" },
    ],
    skipped: [],
  });
});

test("reports keys by position when they contain any canary form", () => {
  const details = Object.fromEntries(canaryForms(canary).map(({ needle }) => [
    `before-${needle}-after`,
    { text: canary },
  ]));
  const result = scanEventsForCanary(canary, { modelInput: [{ details }], busEvents: [] });
  const serialized = JSON.stringify(result);
  for (const { needle } of canaryForms(canary)) {
    assert.ok(!serialized.includes(needle), "result excludes all canary forms");
  }
  assert.ok(!serialized.includes("before-") && !serialized.includes("-after"), "result excludes nearby key text");
  assert.deepEqual(result, {
    hits: canaryForms(canary).flatMap(({ form }, index) => [
      { list: "model", index: 0, path: `details[#${index}] (key)`, form },
      { list: "model", index: 0, path: `details[#${index}].text`, form: "plain" },
    ]),
    skipped: [],
  });
});

test("redacts a path that would join clean keys into a canary", () => {
  const dottedCanary = ["fixture", "orange"].join(".");
  const result = scanEventsForCanary(dottedCanary, {
    modelInput: [{ fixture: { orange: dottedCanary } }],
    busEvents: [],
  });
  assert.ok(!JSON.stringify(result).includes(dottedCanary), "joined paths exclude the canary");
  assert.deepEqual(result, {
    hits: [{ list: "model", index: 0, path: "fixture[#0]", form: "plain" }],
    skipped: [],
  });
});

test("withholds JSON key text when decoding it reveals a canary", () => {
  const key = JSON.stringify(JSON.stringify({ text: `around-${canary}` }));
  const result = scanEventsForCanary(canary, { modelInput: [{ [key]: canary }], busEvents: [] });
  assert.ok(!JSON.stringify(result).includes("around-"), "result excludes text from a JSON key");
  assert.deepEqual(result, {
    hits: [
      { list: "model", index: 0, path: "[#0] (key)", form: "json" },
      { list: "model", index: 0, path: "[#0] (key).text", form: "plain" },
      { list: "model", index: 0, path: "[#0]", form: "plain" },
    ],
    skipped: [],
  });
});

test("skips cycles and still visits shared objects at each path", () => {
  const shared = { text: canary };
  const event: Record<string, unknown> = { left: shared, right: shared };
  event[`around-${canary}`] = event;
  assert.deepEqual(scanEventsForCanary(canary, { modelInput: [], busEvents: [event] }), {
    hits: [
      { list: "bus", index: 0, path: "left.text", form: "plain" },
      { list: "bus", index: 0, path: "right.text", form: "plain" },
      { list: "bus", index: 0, path: "[#2] (key)", form: "plain" },
    ],
    skipped: [{ list: "bus", index: 0, path: "[#2]", reason: "cycle" }],
  });
});

test("does not invoke accessors when visiting an event", () => {
  const event = Object.defineProperty({
    get unsafe() {
      throw new Error("scan called the getter");
    },
  }, "hidden", { value: canary });
  assert.deepEqual(scanEventsForCanary(canary, { modelInput: [], busEvents: [event] }), {
    hits: [{ list: "bus", index: 0, path: "hidden", form: "plain" }],
    skipped: [{ list: "bus", index: 0, path: "unsafe", reason: "accessor" }],
  });
});

test("names a skipped branch when objects or serialized JSON nest too deeply", () => {
  let deep: object = { text: canary };
  let json = "{}";
  for (let level = 0; level < 10_000; level++) {
    deep = { level: deep };
    json = `{"level":${json}}`;
  }
  const { hits, skipped } = scanEventsForCanary(canary, {
    modelInput: [{ deep, json, shallow: canary }],
    busEvents: [],
  });
  assert.deepEqual(hits, [{ list: "model", index: 0, path: "shallow", form: "plain" }]);
  assert.deepEqual(skipped.map(({ list, index, reason }) => ({ list, index, reason })), [
    { list: "model", index: 0, reason: "too-deep" },
    { list: "model", index: 0, reason: "too-deep" },
  ]);
  assert.match(skipped[0].path, /^deep(?:\.level)+$/);
  assert.match(skipped[1].path, /^json(?:\.level)+$/);
});

test("rejects an empty canary even when there is nothing to scan", () => {
  assert.throws(() => scanEventsForCanary("", { modelInput: [], busEvents: [] }), /Canary must be at least 8 characters/);
});
