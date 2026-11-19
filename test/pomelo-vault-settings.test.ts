import assert from "node:assert/strict";
import test from "node:test";
import { vaultSettings } from "../src/client/pomelo/vault-settings.js";

const now = 2_000;
const link = { provider: "1password", account: "Example account", vault: "Personal", status: "SET" };
const ref = {
  id: "ref-1",
  opRef: "op://Personal/Bank/password",
  field: "password",
  allowedOrigins: ["https://z.example.test:8443", "https://a.example.test"],
};
const canary = "CANARY-not-a-real-secret-12345";

test("vault settings show the link status and corresponding action", () => {
  for (const [status, label, action] of [
    ["SET", "Linked", "none"],
    ["UNSET", "Not linked", "link"],
    ["LOCKED", "Locked", "unlock"],
  ]) {
    assert.deepEqual(vaultSettings({ link: { ...link, status }, refs: [], now }).link, {
      status, label, action, account: link.account, vault: link.vault,
    });
  }
});

test("missing, malformed and unknown vault links read as UNSET", () => {
  for (const record of [undefined, null, [], {}, { ...link, provider: "other" }, { ...link, account: 42 }, { ...link, status: "READY" }]) {
    assert.deepEqual(vaultSettings({ link: record, refs: null, now }), {
      link: { status: "UNSET", label: "Not linked", action: "link", account: "", vault: "" },
      refs: [],
    });
  }
});

test("reference rows show sorted hosts and labels without the full reference path", () => {
  const result = vaultSettings({
    link,
    refs: [{ ...ref, id: "ref-2", opRef: "op://Personal/Cards/Details/pin", field: "pin" }, ref],
    now,
  });

  assert.deepEqual(result.refs, [
    { id: "ref-1", label: "Personal / Bank", field: "password", origins: ["a.example.test", "z.example.test:8443"], state: "active" },
    { id: "ref-2", label: "Personal / Cards", field: "pin", origins: ["a.example.test", "z.example.test:8443"], state: "active" },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /op:\/\//i);
});

test("reference rows expire at the deadline and stay expired afterward", () => {
  for (const [expiresAt, state] of [[now - 1, "expired"], [now, "expired"], [now + 1, "active"], [NaN, "expired"]]) {
    const result = vaultSettings({ link, refs: [{ ...ref, expiresAt }], now });
    assert.deepEqual(result.refs.map((row) => row.state), [state]);
  }
});

test("vault settings exclude secret values on extra properties", () => {
  const extra = { value: canary, token: canary, password: canary, cookie: canary };
  const result = vaultSettings({ link: { ...link, ...extra }, refs: [{ ...ref, ...extra }], now });

  assert.deepEqual(result, vaultSettings({ link, refs: [ref], now }));
  assert.ok(!JSON.stringify(result).includes(canary));
});

test("vault settings use Friday's secret shield on displayed metadata", () => {
  const result = vaultSettings({
    link: { ...link, account: `Bearer ${canary}`, vault: `password=${canary}` },
    refs: [{ ...ref, id: `Bearer ${canary}`, opRef: `op://Personal/password=${canary}/password`, field: `password=${canary}` }],
    now,
  });

  assert.equal(result.link.account, "Bearer …[secret hidden]");
  assert.equal(result.link.vault, "password=[secret hidden]");
  assert.deepEqual(result.refs, [{
    id: "Bearer …[secret hidden]",
    label: "Personal / password=[secret hidden]",
    field: "password=[secret hidden]",
    origins: ["a.example.test", "z.example.test:8443"],
    state: "active",
  }]);
  assert.ok(!JSON.stringify(result).includes(canary));
});

test("vault settings suppress reference paths misplaced in display fields", () => {
  const result = vaultSettings({
    link: { ...link, account: `See ${ref.opRef}`, vault: ref.opRef },
    refs: [{ ...ref, id: ref.opRef, field: ref.opRef.toUpperCase() }],
    now,
  });

  assert.equal(result.link.account, "[secret hidden]");
  assert.equal(result.link.vault, "[secret hidden]");
  assert.equal(result.refs[0]?.id, "[secret hidden]");
  assert.equal(result.refs[0]?.field, "[secret hidden]");
  assert.doesNotMatch(JSON.stringify(result), /op:\/\//i);
});

test("vault settings ignore malformed references and origin entries", () => {
  const result = vaultSettings({
    link,
    refs: [null, {}, { ...ref, opRef: "op://Personal//password" }, {
      ...ref,
      allowedOrigins: [null, `https://a.example.test/${canary}`, `https://a.example.test:${canary}@other.example.test`, "https://*.example.test", "https://a.example.test"],
    }],
    now,
  });

  assert.deepEqual(result.refs.map((row) => row.origins), [["a.example.test"]]);
  assert.ok(!JSON.stringify(result).includes(canary));
});
