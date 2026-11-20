import assert from "node:assert/strict";
import test from "node:test";
import { auditList } from "../src/client/pomelo/audit-list.js";
import type { AuditEvent } from "../src/pomelo/audit.js";
import { assertNoCanary, canaryForms } from "../src/pomelo/canary-sweep.js";

const fill = Object.freeze({
  at: 1_800_000_000_000,
  kind: "fill",
  actor: "fixture-worker",
  outcome: "ok",
  jobId: "job-1",
  refId: "ref-1",
  origin: "https://example.test",
} satisfies AuditEvent);
const otherSite = "https://example.test:8443";
const canary = "synthetic-canary-value-42+fixture";
const opaqueCanary = "fictional-audit-value-42";

test("audit rows show plain labels and display metadata for the five kinds", () => {
  const kinds = ["fill", "import", "grant", "revoke", "approval"] as const;
  const { rows, more, empty } = auditList(kinds.map((kind) => ({ ...fill, kind })));

  assert.deepEqual(rows.map(({ kind, label }) => [kind, label]), [
    ["fill", "Filled a saved login"],
    ["import", "Imported cookies from Chrome"],
    ["grant", "Allowed fills on this site"],
    ["revoke", "Fill permission revoked"],
    ["approval", "Request approved"],
  ]);
  assert.deepEqual(rows[0], {
    kind: "fill",
    label: "Filled a saved login",
    at: fill.at,
    site: fill.origin,
    refLabel: "ref-1",
    jobId: "job-1",
  });
  assert.equal(more, false);
  assert.equal(empty, null);
});

test("newest entries come first and ties keep their input order", () => {
  const events = Object.freeze([
    fill,
    Object.freeze({ ...fill, at: fill.at + 2, jobId: "job-2" }),
    Object.freeze({ ...fill, at: fill.at + 2, jobId: "job-3" }),
    Object.freeze({ ...fill, at: fill.at + 1, jobId: "job-4" }),
  ]);

  assert.deepEqual(auditList(events).rows.map((row) => row.jobId), ["job-2", "job-3", "job-4", "job-1"]);
});

test("revoke, denied and expired approvals, and unsuccessful actions show their result", () => {
  const { rows } = auditList([
    { ...fill, kind: "revoke" },
    { ...fill, kind: "approval", outcome: "refused" },
    { ...fill, kind: "approval", outcome: "refused", note: "Approval expired" },
    { ...fill, kind: "approval", outcome: "ok", note: "Request expired" },
    { ...fill, outcome: "refused" },
    { ...fill, kind: "import", outcome: "failed" },
    { ...fill, kind: "revoke", outcome: "failed" },
  ]);

  assert.deepEqual(rows.map((row) => row.label), [
    "Fill permission revoked",
    "Request denied",
    "Request expired",
    "Request expired",
    "Login fill refused",
    "Chrome cookie import failed",
    "Revoking fill permission failed",
  ]);
});

test("kind and exact site origin filters work separately and together", () => {
  const events = [
    fill,
    { ...fill, kind: "grant" },
    { ...fill, origin: otherSite },
    { ...fill, kind: "grant", origin: "https://sub.example.test" },
  ];

  assert.equal(auditList(events, { kind: "grant" }).rows.length, 2);
  assert.equal(auditList(events, { site: fill.origin }).rows.length, 2);
  assert.deepEqual(auditList(events, { kind: "fill", site: otherSite }).rows.map((row) => row.site), [otherSite]);
  assert.deepEqual(auditList(events, { kind: "grant", site: otherSite }), {
    rows: [],
    more: false,
    empty: "No audit entries match these filters.",
  });
  assert.equal(auditList([]).empty, "No audit entries yet.");
});

test("reference paths keep only the whole vault and item label", () => {
  const { rows } = auditList([
    { ...fill, refId: "op://FixtureVault/ExampleLogin/ExtraSection/FixtureField" },
    { ...fill, refId: "op://כספת/כניסה%20לדוגמה/שדה" },
    { ...fill, refId: "גישה לחשבון לדוגמה" },
  ]);

  assert.deepEqual(rows.map((row) => row.refLabel), [
    "FixtureVault / ExampleLogin",
    "כספת / כניסה לדוגמה",
    "גישה לחשבון לדוגמה",
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /op:\/\/|ExtraSection|FixtureField/i);
});

test("unknown fields are ignored and secret-like display metadata is omitted", () => {
  const extra = { cookie: canary, value: canary, unexpected: { nested: canary } };
  const shieldCanary = `sk-${"fixture".repeat(5)}`;
  assert.deepEqual(auditList([{ ...fill, ...extra }]), auditList([fill]));
  const rows = auditList([
    { ...fill, origin: `https://example.test/?sample=${canary}` },
    { ...fill, origin: `https://fixture:${canary}@example.test` },
    { ...fill, refId: `op://FixtureVault/password=${canary}/FixtureField` },
    { ...fill, refId: `op://${canary}/ExampleLogin/FixtureField` },
    { ...fill, refId: `Cookie: sid=${canary}` },
    { ...fill, jobId: `fixture op://FixtureVault/ExampleLogin/FixtureField` },
    { ...fill, jobId: "sid=demo; flag=demo" },
    { ...fill, refId: "op%3A%2F%2FFixtureVault%2FExampleLogin%2FFixtureField" },
    { ...fill, jobId: opaqueCanary, refId: `op://FixtureVault/${opaqueCanary}/FixtureField`, origin: `https://${opaqueCanary}.example.test` },
    { ...fill, jobId: shieldCanary, refId: shieldCanary, origin: `https://${shieldCanary}.example.test` },
  ]).rows;

  assert.equal(rows[0]?.site, undefined);
  assert.equal(rows[1]?.site, undefined);
  assert.ok(rows.slice(2, 5).every((row) => row.refLabel === undefined));
  assert.equal(rows[5]?.jobId, undefined);
  assert.equal(rows[6]?.jobId, undefined);
  assert.equal(rows[7]?.refLabel, undefined);
  assertNoCanary(canary, { rows: JSON.stringify(rows) });
  assertNoCanary(opaqueCanary, { rows: JSON.stringify(rows) });
  assertNoCanary(shieldCanary, { rows: JSON.stringify(rows) });
  assert.doesNotMatch(JSON.stringify(rows), /op:\/\/|FixtureField|sid=/i);
});

test("the canary sweep finds no plain or encoded canary in any projected field", () => {
  const fields = ["at", "kind", "actor", "outcome", "threadId", "jobId", "refId", "grantId", "origin", "note"];
  for (const value of [
    ...canaryForms(canary).map(({ needle }) => needle),
    Buffer.from(canary).toString("base64"),
    Buffer.from(canary).toString("base64url"),
  ]) {
    const events = fields.flatMap((field) => [
      { ...fill, [field]: value },
      ...(field === "origin" ? [{ ...fill, origin: `https://${value}.example.test` }] : []),
      ...(field === "refId" ? [{ ...fill, refId: `op://FixtureVault/${value}/FixtureField` }] : []),
    ]);
    assertNoCanary(canary, { audit: JSON.stringify(auditList(events)) });
  }
});

test("unknown kinds, bad timestamps and malformed records get one unreadable row each", () => {
  const result = auditList([
    { ...fill, at: "bad time" },
    fill,
    { ...fill, kind: "toString", at: fill.at + 1 },
    { ...fill, at: Infinity },
    { ...fill, at: 8_640_000_000_000_001 },
    null,
  ]);

  assert.deepEqual(result.rows.map(({ label, at }) => [label, at]), [
    ["Unreadable entry", fill.at + 1],
    ["Filled a saved login", fill.at],
    ["Unreadable entry", null],
    ["Unreadable entry", null],
    ["Unreadable entry", null],
    ["Unreadable entry", null],
  ]);
  assert.equal(result.empty, null);
});

test("paging limits the sorted matches and reports when more remain", () => {
  const events = Array.from({ length: 60 }, (_, index) => ({
    ...fill,
    at: fill.at + index,
    origin: index % 2 ? otherSite : fill.origin,
  }));

  const firstPage = auditList(events, { site: fill.origin, pageSize: 3 });
  assert.deepEqual(firstPage.rows.map((row) => row.at), [fill.at + 58, fill.at + 56, fill.at + 54]);
  assert.equal(firstPage.more, true);
  assert.equal(firstPage.empty, null);
  assert.equal(auditList(events, { site: fill.origin, pageSize: 30 }).more, false);
});
