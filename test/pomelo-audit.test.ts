import assert from "node:assert/strict";
import test from "node:test";
import * as audit from "../src/pomelo/audit.js";
import type { AuditEvent, AuditKind } from "../src/pomelo/audit.js";

const base = {
  at: 1_800_000_000_000,
  kind: "fill",
  actor: "worker-1",
  outcome: "ok",
} satisfies AuditEvent;

function fakeSink() {
  const calls: { key: string; entry: unknown }[] = [];
  return {
    calls,
    async appendLog(key: string, entry: unknown): Promise<void> {
      calls.push({ key, entry });
    },
  };
}

test("each audit kind appends one event under the audit key", async () => {
  const sink = fakeSink();
  const kinds: AuditKind[] = ["fill", "import", "grant", "revoke", "approval"];
  const outcomes = ["ok", "refused", "failed"] as const;
  const expected = kinds.map((kind, index) => ({
    ...base,
    kind,
    at: base.at + index,
    outcome: outcomes[index % outcomes.length],
  }));

  for (const [index, event] of expected.entries()) {
    await audit.recordAudit(sink, event);
    assert.equal(sink.calls.length, index + 1);
  }
  assert.deepEqual(sink.calls, expected.map((entry) => ({ key: "audit", entry })));
});

test("auditEvent copies the required and optional metadata", () => {
  const input = {
    ...base,
    threadId: "t".repeat(80),
    jobId: "job-1",
    refId: "ref-1",
    grantId: "grant-1",
    origin: "https://example.test:8443",
    note: "n".repeat(200),
  };
  const result = audit.auditEvent(input);
  assert.ok("event" in result);
  assert.deepEqual(result.event, input);
  assert.notEqual(result.event, input);
  assert.deepEqual(audit.auditEvent(base), { event: base });
});

test("audit refuses unknown kinds, outcomes, and fields without appending", async () => {
  const sink = fakeSink();
  const unexpectedFields = ["value", "password", "cookie", "token", "toJSON", "__proto__"];
  const invalidInputs = [
    { ...base, kind: "other" },
    { ...base, outcome: "other" },
    ...unexpectedFields.map((field) => ({ ...base, [field]: true })),
    { ...base, [Symbol("unexpected")]: true },
    Object.defineProperty({ ...base }, "value", { value: true }),
  ];

  for (const input of invalidInputs) {
    assert.ok("error" in audit.auditEvent(input));
    assert.ok("error" in await audit.recordAudit(sink, input));
  }
  assert.deepEqual(sink.calls, []);
});

test("audit refuses malformed inputs and accessors without appending", async () => {
  const sink = fakeSink();
  const withGetter = Object.defineProperty({ ...base }, "note", {
    get() {
      assert.fail("audit must not invoke getters on the input");
    },
  });
  for (const input of [null, [], {}, { ...base, at: Infinity }, { ...base, actor: {} }, { ...base, note: [] }, withGetter]) {
    assert.ok("error" in await audit.recordAudit(sink, input));
  }
  assert.deepEqual(sink.calls, []);
});

test("audit replaces every text field matched by Friday's shield with the placeholder", async () => {
  const sink = fakeSink();
  const canary = `sk-${"madeup0".repeat(5)}`;
  for (const field of ["actor", "threadId", "jobId", "refId", "grantId", "origin", "note"] as const) {
    const value = field === "origin" ? `https://${canary}.example.test` : canary;
    const input: AuditEvent = { ...base, [field]: value };
    await audit.recordAudit(sink, input);
    assert.deepEqual(sink.calls.at(-1), {
      key: "audit",
      entry: { ...base, [field]: "[secret hidden]" },
    });
    assert.equal(input[field], value);
  }
});

test("audit refuses overlong notes and IDs without appending", async () => {
  const sink = fakeSink();
  assert.ok("error" in await audit.recordAudit(sink, { ...base, note: "n".repeat(201) }));
  for (const field of ["actor", "threadId", "jobId", "refId", "grantId"]) {
    assert.ok("error" in await audit.recordAudit(sink, { ...base, [field]: "x".repeat(81) }));
  }
  assert.deepEqual(sink.calls, []);
});

test("audit only accepts a canonical origin without extra URL components", async () => {
  const sink = fakeSink();
  for (const origin of [
    "https://example.test/path",
    "https://example.test?query=sample",
    "https://example.test/#fragment",
    "https://user@example.test",
    "https://example.test/",
    "https://EXAMPLE.test",
    "null",
  ]) {
    assert.ok("error" in await audit.recordAudit(sink, { ...base, origin }));
  }
  assert.deepEqual(sink.calls, []);
});

test("audit exports a builder and an append operation", () => {
  assert.deepEqual(Object.keys(audit).sort(), ["auditEvent", "recordAudit"]);
});
