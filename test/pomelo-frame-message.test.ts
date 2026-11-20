import assert from "node:assert/strict";
import test from "node:test";
import { readFrameMessage } from "../src/client/pomelo/frame-message.js";

const frameToken = "test-frame";
const message = { type: "pomelo:artifact:height", token: frameToken, height: 240 };
const event = { origin: "null", fromOwnFrame: true, data: message };

test("accepts a height from the sandboxed artifact's own frame", () => {
  assert.deepEqual(readFrameMessage(event, frameToken), { action: "resize", height: 240 });
});

test("rounds finite heights and clamps them to the default bounds", () => {
  for (const [height, expected] of [[10, 80], [99999, 4000], [123.6, 124], [-12, 80]]) {
    assert.deepEqual(readFrameMessage({ ...event, data: { ...message, height } }, frameToken), {
      action: "resize",
      height: expected,
    });
  }
});

test("ignores non-finite and non-numeric heights", () => {
  for (const height of [NaN, Infinity, -Infinity, "240"]) {
    assert.equal(readFrameMessage({ ...event, data: { ...message, height } }, frameToken).action, "ignore");
  }
});

test("gives distinct reasons for the wrong origin, source or token and for a missing token", () => {
  const rejectedEvents = [
    { ...event, origin: "https://example.com" },
    { ...event, fromOwnFrame: false },
    { ...event, data: { ...message, token: "another-frame" } },
    { ...event, data: { type: message.type, height: message.height } },
  ];
  const reasons = new Set<string>();
  for (const rejected of rejectedEvents) {
    const result = readFrameMessage(rejected, frameToken);
    assert.equal(result.action, "ignore");
    assert.ok(result.reason.trim());
    reasons.add(result.reason);
  }
  assert.equal(reasons.size, rejectedEvents.length);
});

test("ignores malformed data and messages with extra fields", () => {
  const oversized = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`extra${index}`, index]));
  const rejectedData = [
    JSON.stringify(message),
    null,
    [message],
    Object.create(message),
    { ...message, type: "navigate" },
    { ...message, navigate: "/elsewhere" },
    { ...message, script: "fixture" },
    { ...message, ...oversized },
    { ...message, [Symbol("extra")]: true },
    Object.defineProperty({ ...message }, "extra", { value: true }),
  ];
  for (const data of rejectedData) {
    assert.equal(readFrameMessage({ ...event, data }, frameToken).action, "ignore");
  }
});

test("ignores accessors and unreadable objects without throwing", () => {
  let heightReads = 0;
  const accessor = {
    ...message,
    get height() {
      heightReads++;
      return 240;
    },
  };
  const { proxy, revoke } = Proxy.revocable(message, {});
  revoke();

  assert.equal(readFrameMessage({ ...event, data: accessor }, frameToken).action, "ignore");
  assert.equal(heightReads, 0);
  assert.equal(readFrameMessage({ ...event, data: proxy }, frameToken).action, "ignore");
});

test("honors custom bounds and defaults an omitted bound", () => {
  assert.deepEqual(readFrameMessage(event, frameToken, { minHeight: 260, maxHeight: 300 }), {
    action: "resize",
    height: 260,
  });
  assert.deepEqual(readFrameMessage(event, frameToken, { maxHeight: 180 }), { action: "resize", height: 180 });
});

test("ignores invalid bounds", () => {
  for (const limits of [{ minHeight: -1 }, { maxHeight: Infinity }, { minHeight: 300, maxHeight: 200 }]) {
    assert.equal(readFrameMessage(event, frameToken, limits).action, "ignore");
  }
});

test("an ignored message returns only an action and a fixed reason", () => {
  const first = readFrameMessage({ ...event, data: { ...message, type: "fixture-one" } }, frameToken);
  const second = readFrameMessage({ ...event, data: { ...message, type: "fixture-two" } }, frameToken);
  assert.equal(first.action, "ignore");
  assert.deepEqual(Reflect.ownKeys(first).sort(), ["action", "reason"]);
  assert.deepEqual(first, second);
  assert.doesNotMatch(first.reason, /fixture-|test-frame/);
});
