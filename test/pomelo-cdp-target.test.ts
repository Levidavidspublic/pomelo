import assert from "node:assert/strict";
import test from "node:test";
import { cdpTarget, targetLabel } from "../src/pomelo/browser/cdp-target.js";

const cloud = { location: "cloud", cdpUrlName: "POMELO_CDP_URL" } as const;
const loopback = "http://127.0.0.1:19222";

test("a local profile ignores the environment", () => {
  const env = {
    get POMELO_CDP_URL(): string {
      return assert.fail("a local profile should not read the environment");
    },
  };
  const target = cdpTarget({ location: "local", cdpUrlName: "POMELO_CDP_URL" }, env);
  assert.deepEqual(target, { kind: "local" });
  assert.equal(targetLabel(target), "This computer");
});

test("a cloud profile resolves the named loopback URL over HTTP or WebSocket", () => {
  for (const url of [loopback, "https://localhost:19222", "ws://[::1]:19222", "wss://127.0.0.1:19222"]) {
    const target = cdpTarget(cloud, { POMELO_CDP_URL: url });
    assert.deepEqual(target, { kind: "cloud", url });
    assert.equal(targetLabel(target), "VPS");
  }

  const alternate = { ...cloud, cdpUrlName: "POMELO_CDP_2" };
  assert.deepEqual(cdpTarget(alternate, { POMELO_CDP_2: loopback }), { kind: "cloud", url: loopback });
});

test("a missing or empty environment value leaves the cloud target unset", () => {
  for (const env of [{}, { POMELO_CDP_URL: "" }]) {
    const target = cdpTarget(cloud, env);
    assert.deepEqual(target, { kind: "unavailable", reason: "unset" });
    assert.equal(targetLabel(target), "VPS not reachable");
  }
});

test("a cloud profile needs a valid Pomelo environment name", () => {
  assert.deepEqual(cdpTarget({ location: "cloud" }, {}), { kind: "unavailable", reason: "bad-name" });
  for (const cdpUrlName of ["", "POMELO_", "CDP_URL", "POMELO_cdp", "POMELO_CDP-URL", "POMELO_CDP_URL\n"]) {
    const target = cdpTarget({ ...cloud, cdpUrlName }, { [cdpUrlName]: loopback });
    assert.deepEqual(target, { kind: "unavailable", reason: "bad-name" });
    assert.equal(JSON.stringify(target).includes(loopback), false);
  }
});

test("rejected URLs return only a status and a reason", () => {
  const cases = [
    ["http://example.invalid:19222", "not-local"],
    ["http://localhost.example.invalid:19222", "not-local"],
    ["http://127.0.0.2:19222", "not-local"],
    ["http://user@127.0.0.1:19222", "bad-url"],
    ["http://:placeholder@127.0.0.1:19222", "bad-url"],
    ["ftp://127.0.0.1:19222", "bad-url"],
    ["malformed", "bad-url"],
    ["http://127.0.0.1:99999", "bad-url"],
  ];
  for (const [url, reason] of cases) {
    const target = cdpTarget(cloud, { POMELO_CDP_URL: url });
    assert.deepEqual(target, { kind: "unavailable", reason });
    assert.equal(JSON.stringify(target).includes(url), false);
    assert.equal(targetLabel(target), "VPS not reachable");
  }
});
