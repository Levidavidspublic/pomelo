import assert from "node:assert/strict";
import test from "node:test";
import { checkApprovalEdit } from "../src/pomelo/approval-edit.js";

const pending = Object.freeze({
  id: "approval-1",
  kind: "fill",
  action: "fill sign-in form",
  origin: "https://shop.example",
  frameOrigin: "https://login.shop.example:8443",
  accountLabel: "Personal account",
  expiresAt: 2_000,
  state: "pending",
});
const input = Object.freeze({
  approval: pending,
  edit: Object.freeze({ accountLabel: "Work account" }),
  fittingAccountLabels: Object.freeze(["Personal account", "Work account"]),
  actor: "amit",
  now: 1_000,
  newId: "approval-2",
});
const importApproval = Object.freeze({
  ...pending,
  kind: "import",
  action: "import selected sites",
  sites: Object.freeze(["shop.example", "news.example", "mail.example"]),
});

function assertRefused(candidate: unknown) {
  const result = checkApprovalEdit(candidate);
  assert.equal(result.status, "refused");
  assert.ok(result.reason.trim());
  return result.reason;
}

test("Amit can choose another saved account and gets a new pending approval", () => {
  assert.deepEqual(checkApprovalEdit(input), {
    status: "allowed",
    newApproval: { ...pending, id: input.newId, accountLabel: "Work account" },
    oldApproval: { ...pending, state: "replaced", replacedBy: input.newId },
  });
});

test("only an exact account label from the fitting list can replace the account", () => {
  for (const accountLabel of ["Unlisted account", "work account"]) {
    assertRefused({ ...input, edit: { accountLabel } });
  }
  const result = checkApprovalEdit({ ...input, edit: {}, fittingAccountLabels: [] });
  assert.equal(result.status, "allowed");
  assert.equal(result.newApproval.accountLabel, pending.accountLabel);
});

test("agents cannot edit even when the proposed change is otherwise allowed", () => {
  assertRefused({ ...input, actor: "agent" });
  assertRefused({ ...input, actor: "agent", edit: {} });
});

test("the kind, action, origin, and frame origin are fixed", () => {
  for (const edit of [
    { kind: "import" },
    { action: "fill and submit form" },
    { origin: "https://other.example" },
    { origin: "http://shop.example" },
    { origin: "https://shop.example:443" },
    { origin: "https://shop.example/" },
    { origin: "https://shop.example/path" },
    { frameOrigin: "https://other.example:8443" },
    { frameOrigin: "https://login.shop.example:9443" },
  ]) {
    assertRefused({ ...input, edit });
  }
});

test("origin comparisons ignore host case and preserve the original bindings", () => {
  const result = checkApprovalEdit({
    ...input,
    edit: {
      ...input.edit,
      origin: "https://SHOP.example",
      frameOrigin: "https://LOGIN.Shop.example:8443",
    },
  });
  assert.equal(result.status, "allowed");
  assert.equal(result.newApproval.origin, pending.origin);
  assert.equal(result.newApproval.frameOrigin, pending.frameOrigin);
});

test("only a pending approval before its expiry can be edited", () => {
  for (const state of ["denied", "approved", "expired", "replaced"]) {
    const approval = state === "replaced"
      ? { ...pending, state, replacedBy: input.newId }
      : { ...pending, state };
    assertRefused({ ...input, approval });
  }
  for (const now of [pending.expiresAt, pending.expiresAt + 1]) {
    assertRefused({ ...input, now });
  }
});

test("a frozen import can lose sites while the replaced card keeps its original sites", () => {
  const sites = Object.freeze(["shop.example", "mail.example"]);
  const result = checkApprovalEdit(Object.freeze({
    ...input,
    approval: importApproval,
    edit: Object.freeze({ sites }),
  }));
  assert.equal(result.status, "allowed");
  assert.deepEqual(result.newApproval.sites, sites);
  assert.deepEqual(result.oldApproval.sites, importApproval.sites);
  assert.notEqual(result.newApproval.sites, sites);
  assert.notEqual(result.oldApproval.sites, importApproval.sites);
  assert.equal(importApproval.state, "pending");
});

test("an import must retain at least one site and cannot add or substitute sites", () => {
  for (const sites of [
    [],
    [...importApproval.sites, "other.example"],
    ["shop.example", "other.example"],
    ["sub.shop.example"],
  ]) {
    assertRefused({ ...input, approval: importApproval, edit: { sites } });
  }
  assertRefused({ ...input, edit: { sites: ["shop.example"] } });
});

test("the new expiry can be shortened and is capped by the original deadline", () => {
  for (const expiresAt of [1_500, 3_000]) {
    const result = checkApprovalEdit({ ...input, edit: { expiresAt } });
    assert.equal(result.status, "allowed");
    assert.equal(result.newApproval.expiresAt, Math.min(expiresAt, pending.expiresAt));
    assert.equal(result.oldApproval.expiresAt, pending.expiresAt);
  }
  assertRefused({ ...input, edit: { expiresAt: input.now } });
  assertRefused({ ...input, newId: pending.id });
});

test("secret fields are refused and never echoed in a reason", () => {
  const marker = "synthetic-approval-marker";
  for (const key of ["value", "password", "cookie"]) {
    for (const candidate of [
      { ...input, edit: { ...input.edit, [key]: marker } },
      { ...input, approval: { ...pending, [key]: marker } },
      { ...input, [key]: marker },
      { ...input, fittingAccountLabels: Object.assign([...input.fittingAccountLabels], { [key]: marker }) },
      { ...input, approval: importApproval, edit: { sites: [{ [key]: marker }] } },
    ]) {
      assert.ok(!assertRefused(candidate).includes(marker));
    }
  }
});

test("malformed inputs are refused without reading accessors", () => {
  let reads = 0;
  const edit = { get accountLabel() { reads++; return "Work account"; } };
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  for (const candidate of [
    undefined, null, [], 7, {},
    { ...input, actor: "user" },
    { ...input, now: NaN },
    { ...input, newId: " " },
    { ...input, fittingAccountLabels: "Work account" },
    { ...input, fittingAccountLabels: new Array(1) },
    { ...input, approval: { ...pending, expiresAt: Infinity } },
    { ...input, approval: { ...pending, origin: "https://fixture@shop.example" } },
    { ...input, approval: { ...pending, frameOrigin: "about:blank" } },
    { ...input, approval: { ...importApproval, sites: [] } },
    { ...input, edit: { expiresAt: "1500" } },
    { ...input, edit: { state: "approved" } },
    { ...input, edit },
    { ...input, edit: revocable.proxy },
  ]) {
    assertRefused(candidate);
  }
  assert.equal(reads, 0);
});
