import assert from "node:assert/strict";
import test from "node:test";
import { auditEvent } from "../src/pomelo/audit.js";
import type { FillAttempt } from "../src/pomelo/broker/fill-attempts.js";
import { runFill, type FillRunInput } from "../src/pomelo/broker/fill-run.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";
import { fillReply, type FillStatus } from "../src/pomelo/fill-reply.js";
import { newGrant, revokeGrant } from "../src/pomelo/grant.js";
import { newSecretRef } from "../src/pomelo/secret-ref.js";

const origin = "https://example.test";
const pageUrl = `${origin}/login`;
const now = 10_000;
const frameId = "login-frame";
const jobId = "sample-job";
const canary = [" pomelo", "-fill-run", "-canary! \n"].join("");
const usernameValue = `username:${canary}`;
const passwordValue = `password:${canary}`;

function credential(part: "username" | "password", field: string) {
  const ref = newSecretRef({
    id: `${part}-ref`,
    opRef: `op://fictional-vault/sample-item/${part}`,
    allowedOrigins: [origin],
    field,
  });
  const grant = newGrant(ref, { id: `${part}-grant`, origin, frame: frameId, jobId, expiresAt: now + 1_000 });
  return { part, grant, ref };
}

const username = credential("username", "account");
const password = credential("password", "password");
const credentials = [username, password] as const;
const field = { visible: true, editable: true, frame: frameId };
const fields = [
  { ...field, id: password.ref.field, type: "password" },
  { ...field, id: username.ref.field, type: "text", autocomplete: "username" },
];
const target = { pageUrl, frameUrl: pageUrl, isTopFrame: true, frameId };
const form = { method: "post", action: "/login" };
const failures: FillAttempt[] = [now - 2, now - 1].map((at) => ({
  origin, refId: password.ref.id, jobId, at, outcome: "login-failed",
}));

type Result = Awaited<ReturnType<typeof runFill>>;

async function fixture(overrides: Partial<FillRunInput> = {}) {
  const calls: [kind: "read" | "fill", ...args: string[]][] = [];
  const run: FillRunInput["run"] = async (args) => {
    const ref = args.at(-1);
    return {
      code: 0,
      stdout: ref === username.ref.opRef ? usernameValue : passwordValue,
      stderr: canary,
    };
  };
  const result = await runFill({
    credentials, fields, target, form, attempts: [], now,
    ...overrides,
    run: async (args) => {
      calls.push(["read", ...args]);
      return (overrides.run ?? run)(args);
    },
    fillField: async (fieldId, value) => {
      calls.push(["fill", fieldId, value]);
      await overrides.fillField?.(fieldId, value);
    },
  });
  assertNoCanary(canary, { result: JSON.stringify(result) });
  assert.deepEqual(auditEvent(result.audit), { event: result.audit });
  return { result, calls };
}

function assertResult(
  result: Result,
  status: FillStatus,
  decision: Result["outcome"]["decision"],
  rule: Result["outcome"]["rule"],
) {
  assert.deepEqual(result.reply, fillReply({ status }));
  assert.equal(result.audit.note, status);
  assert.equal(result.outcome.decision, decision);
  assert.equal(result.outcome.rule, rule);
}

test("fills each planned field once with the value from its own reference", async () => {
  const { result, calls } = await fixture();
  assert.deepEqual(calls, [
    ["read", "read", "--no-newline", username.ref.opRef],
    ["fill", username.ref.field, usernameValue],
    ["read", "read", "--no-newline", password.ref.opRef],
    ["fill", password.ref.field, passwordValue],
  ]);
  assertResult(result, "filled", "filled", "brokerFill");
  assert.deepEqual(result.audit, {
    at: now, kind: "fill", actor: "broker", outcome: "ok", origin, refId: username.ref.id, note: "filled",
  });
});

const lookAlike = { ...target, pageUrl: "https://example-test.test/login" };
const getForm = { ...form, method: "get" };
const ambiguousFields = [...fields, { ...fields[0], id: "second-password" }];

const blockedCases = [
  {
    name: "failed login attempts take precedence over a mismatched target",
    input: { attempts: failures, target: lookAlike },
    status: "denied", decision: "hold", rule: "fillAttemptRule",
  },
  {
    name: "a look-alike host is refused before the form rule",
    input: { target: lookAlike, form: getForm },
    status: "wrong_origin", decision: "refused", rule: "checkFillTarget",
  },
  {
    name: "a different frame at the same origin is refused",
    input: { target: { ...target, frameId: "other-frame", isTopFrame: false } },
    status: "wrong_origin", decision: "refused", rule: "checkFillTarget",
  },
  {
    name: "a GET form is refused before the field plan",
    input: { form: getForm, fields: ambiguousFields },
    status: "denied", decision: "refused", rule: "checkFormTarget",
  },
  {
    name: "an ambiguous field holds the entire plan",
    input: { fields: ambiguousFields },
    status: "denied", decision: "hold", rule: "planFill",
  },
  {
    name: "a matching field outside the reference binding is refused",
    input: { fields: [{ ...fields[0], id: "other-password" }, fields[1]] },
    status: "denied", decision: "refused", rule: "planFill",
  },
  {
    name: "a revoked grant is denied before its reference is read",
    input: { credentials: [{ ...username, grant: revokeGrant(username.grant) }] },
    status: "denied", decision: "refused", rule: "brokerFill",
  },
] as const;

for (const { name, input, status, decision, rule } of blockedCases) {
  test(name, async () => {
    const { calls, result } = await fixture(input);
    assert.deepEqual(calls, []);
    assertResult(result, status, decision, rule);
    assert.equal(result.audit.outcome, "refused");
  });
}

test("a locked 1Password stops after the first read", async () => {
  const { result, calls } = await fixture({
    run: async () => ({ code: 1, stdout: canary, stderr: `Account locked: ${canary}` }),
  });
  assert.deepEqual(calls, [["read", "read", "--no-newline", username.ref.opRef]]);
  assertResult(result, "locked", "hold", "brokerFill");
});

test("a missing 1Password field returns no_ref", async () => {
  const { result, calls } = await fixture({
    run: async () => ({ code: 1, stdout: canary, stderr: `Field not found: ${canary}` }),
  });
  assert.deepEqual(calls, [["read", "read", "--no-newline", username.ref.opRef]]);
  assertResult(result, "no_ref", "refused", "brokerFill");
});

test("a rejected fill returns a fixed failure and stops before the next read", async () => {
  const { result, calls } = await fixture({
    fillField: async (_fieldId, value) => { throw new Error(`Synthetic error: ${value}`); },
  });
  assert.deepEqual(calls, [
    ["read", "read", "--no-newline", username.ref.opRef],
    ["fill", username.ref.field, usernameValue],
  ]);
  assertResult(result, "failed", "refused", "brokerFill");
  assert.equal(result.audit.outcome, "failed");
  assert.equal(result.outcome.reason, "The fill failed.");
});

test("exceptions from a check return a fixed failure without running 1Password", async () => {
  const { result, calls } = await fixture({
    fields: [{ ...field, get id(): string { throw new Error(canary); } }],
  });
  assert.deepEqual(calls, []);
  assertResult(result, "failed", "refused", "planFill");
  assert.equal(result.outcome.reason, "The fill failed.");
});
