import assert from "node:assert/strict";
import test from "node:test";
import { fillReply, type FillStatus } from "../src/pomelo/fill-reply.js";

const statuses: FillStatus[] = ["filled", "locked", "denied", "expired", "wrong_origin", "no_ref", "failed"];
const canary = "pomelo-test-canary";

for (const status of statuses) {
  test(`${status} returns only a status, fixed text, and an approval flag`, () => {
    const reply = fillReply({ status });
    assert.deepEqual(reply, { status, text: reply.text, needsApproval: status === "locked" });
    assert.match(reply.text, /\S/);
    if (status === "locked") assert.match(reply.text, /Unlock 1Password/);
  });

  test(`${status} keeps the fill canary out of the serialized reply`, () => {
    const expected = fillReply({ status });
    const assertSafe = (outcome: Parameters<typeof fillReply>[0]) => {
      const reply = fillReply(outcome);
      assert.equal(JSON.stringify(reply).includes(canary), false);
      assert.deepEqual(reply, expected);
    };

    assertSafe({ status, detail: canary });
    try {
      throw new Error(canary);
    } catch (detail) {
      assertSafe({ status, detail });
    }
    assertSafe({ status, refId: `invalid/${canary}`, origin: "https://example.test" });
    assertSafe({ status, refId: "example-ref", origin: `https://example.test/${canary}` });
  });
}

test("unknown statuses use the fixed failed reply", () => {
  const expected = fillReply({ status: "failed" });
  for (const status of [canary, "constructor", "__proto__", null, ["locked"]]) {
    assert.deepEqual(fillReply({ status: status as FillStatus }), expected);
  }
});
