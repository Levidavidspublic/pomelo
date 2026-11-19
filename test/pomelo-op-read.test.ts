import assert from "node:assert/strict";
import test from "node:test";
import { brokerFill, opReadArgs } from "../src/pomelo/broker/op-read.js";
import { newGrant, revokeGrant } from "../src/pomelo/grant.js";
import { newSecretRef } from "../src/pomelo/secret-ref.js";

const ref = newSecretRef({
  id: "sample-ref",
  opRef: "op://fictional-vault/sample-item/sample-field",
  allowedOrigins: ["https://example.test"],
  field: "#sample-input",
});
const context = { origin: "https://example.test", frame: "sample-frame", now: 1_000 };
const grant = newGrant(ref, {
  id: "sample-grant",
  origin: context.origin,
  frame: context.frame,
  jobId: "sample-job",
  expiresAt: 2_000,
});
const canary = " pomelo-fictional-canary! \n";
const encodedCanary = Buffer.from(canary).toString("base64");

function assertStatusOnly(result: unknown, status: string) {
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(JSON.stringify(canary).slice(1, -1)), false);
  assert.equal(serialized.includes(canary.trim()), false);
  assert.equal(serialized.includes(encodedCanary), false);
  assert.deepEqual(result, { status });
}

test("op read uses an argument array with the reference as a single element", () => {
  assert.deepEqual(opReadArgs(ref), ["read", "--no-newline", ref.opRef]);
});

test("invalid op read references throw a TypeError without echoing the input", () => {
  for (const opRef of [
    "https://example.test/sample-item/sample-field",
    `-${ref.opRef}`,
    "op://fictional vault/sample-item/sample-field",
    `${ref.opRef}\t`,
    `${ref.opRef}\n`,
  ]) {
    assert.throws(() => opReadArgs({ ...ref, opRef }), (error: unknown) => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.message.includes(opRef.trim()), false);
      return true;
    });
  }
});

test("a successful read fills the exact value once and returns only filled", async () => {
  const runs: string[][] = [];
  const fills: string[] = [];
  const result = await brokerFill({
    grant, ref, context,
    run: async (args) => {
      runs.push(args);
      return { code: 0, stdout: canary, stderr: `Not signed in: ${canary}` };
    },
    fill: async (value) => { fills.push(value); },
  });

  assert.deepEqual(runs, [["read", "--no-newline", ref.opRef]]);
  assert.deepEqual(fills, [canary]);
  assertStatusOnly(result, "filled");
});

const denials = [
  { reason: "the grant is revoked", grant: revokeGrant(grant), context },
  { reason: "the grant has expired", grant, context: { ...context, now: grant.expiresAt } },
  { reason: "the origin is wrong", grant, context: { ...context, origin: "https://other.test" } },
];

for (const denial of denials) {
  test(`the broker denies the fill before reading when ${denial.reason}`, async () => {
    let runCalls = 0;
    let fillCalls = 0;
    const result = await brokerFill({
      grant: denial.grant, ref, context: denial.context,
      run: async () => {
        runCalls++;
        return { code: 0, stdout: canary, stderr: canary };
      },
      fill: async () => { fillCalls++; },
    });

    assert.equal(runCalls, 0);
    assert.equal(fillCalls, 0);
    assertStatusOnly(result, "denied");
  });
}

const cliErrors = [
  { stderr: "You are not signed in", status: "locked" },
  { stderr: "Session expired", status: "locked" },
  { stderr: "The account is locked", status: "locked" },
  { stderr: "Authorization prompt dismissed", status: "locked" },
  { stderr: "The reference isn't an item", status: "not_found" },
  { stderr: "Field not found", status: "not_found" },
  { stderr: "No item matched", status: "not_found" },
  { stderr: "Unexpected CLI error", status: "failed" },
];

for (const { stderr, status } of cliErrors) {
  test(`the CLI error ${JSON.stringify(stderr)} returns only ${status}`, async () => {
    let runCalls = 0;
    let fillCalls = 0;
    const result = await brokerFill({
      grant, ref, context,
      run: async () => {
        runCalls++;
        return { code: 1, stdout: canary, stderr: `${stderr}: ${canary}` };
      },
      fill: async () => { fillCalls++; },
    });

    assert.equal(runCalls, 1);
    assert.equal(fillCalls, 0);
    assertStatusOnly(result, status);
  });
}

test("a successful CLI exit with empty stdout returns only not_found", async () => {
  let fillCalls = 0;
  const result = await brokerFill({
    grant, ref, context,
    run: async () => ({ code: 0, stdout: "", stderr: `Locked: ${canary}` }),
    fill: async () => { fillCalls++; },
  });

  assert.equal(fillCalls, 0);
  assertStatusOnly(result, "not_found");
});

test("a bad reference with a matching grant returns failed before reading or filling", async () => {
  let runCalls = 0;
  let fillCalls = 0;
  const result = await brokerFill({
    grant, ref: { ...ref, opRef: `${ref.opRef} ${canary}` }, context,
    run: async () => {
      runCalls++;
      return { code: 0, stdout: canary, stderr: canary };
    },
    fill: async () => { fillCalls++; },
  });

  assert.equal(runCalls, 0);
  assert.equal(fillCalls, 0);
  assertStatusOnly(result, "failed");
});

test("a runner throwing with the canary returns only failed without filling", async () => {
  let fillCalls = 0;
  const result = await brokerFill({
    grant, ref, context,
    run: () => { throw new Error(canary); },
    fill: async () => { fillCalls++; },
  });

  assert.equal(fillCalls, 0);
  assertStatusOnly(result, "failed");
});

test("a fill callback rejecting with the canary returns only failed", async () => {
  const fills: string[] = [];
  const result = await brokerFill({
    grant, ref, context,
    run: async () => ({ code: 0, stdout: canary, stderr: canary }),
    fill: async (value) => {
      fills.push(value);
      throw new Error(value);
    },
  });

  assert.deepEqual(fills, [canary]);
  assertStatusOnly(result, "failed");
});
