import assert from "node:assert/strict";
import test from "node:test";
import { NET_ERROR_MAX_TRIES, netErrorStop, type NetErrorFacts } from "../src/pomelo/browser/net-error-stop.js";

const firstFailure = {
  code: "ERR_CONNECTION_RESET",
  mainFrame: true,
  triesSoFar: 1,
  fillInFlight: false,
  importInFlight: false,
  runner: "pc",
} satisfies NetErrorFacts;

const transientCodes = [
  "ERR_INTERNET_DISCONNECTED",
  "ERR_NETWORK_CHANGED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_TIMED_OUT",
  "ERR_CONNECTION_REFUSED",
];
const dnsCode = "ERR_NAME_NOT_RESOLVED";
const exhaustedReason = "The site could not be reached after 3 tries";

for (const code of transientCodes) {
  test(`${code} allows three increasingly delayed retries before holding`, () => {
    assert.equal(NET_ERROR_MAX_TRIES, 3);
    let previousWait = 0;
    for (const triesSoFar of [1, 2, 3]) {
      const result = netErrorStop({ ...firstFailure, code, triesSoFar });
      assert.equal(result.verdict, "retry");
      assert.ok(Number.isFinite(result.waitMs) && result.waitMs > previousWait);
      previousWait = result.waitMs;
    }
    for (const triesSoFar of [4, 5]) {
      assert.deepEqual(netErrorStop({ ...firstFailure, code, triesSoFar }), {
        verdict: "hold", reason: exhaustedReason, countsAsDone: false,
      });
    }
  });
}

test("a DNS failure allows one retry before holding", () => {
  const failure = { ...firstFailure, code: dnsCode };
  const first = netErrorStop(failure);
  assert.equal(first.verdict, "retry");
  assert.ok(Number.isFinite(first.waitMs) && first.waitMs > 0);
  assert.deepEqual(netErrorStop({ ...failure, triesSoFar: 2 }), {
    verdict: "hold", reason: "The address could not be found. It may be mistyped", countsAsDone: false,
  });
});

test("a disconnected VPS retries within the limit and then names the VPS in the hold", () => {
  const failure = { ...firstFailure, code: "ERR_INTERNET_DISCONNECTED", runner: "vps" } as const;
  for (const triesSoFar of [1, 2, 3]) {
    assert.equal(netErrorStop({ ...failure, triesSoFar }).verdict, "retry");
  }
  assert.deepEqual(netErrorStop({ ...failure, triesSoFar: 4 }), {
    verdict: "hold", reason: "The VPS browser has no network", countsAsDone: false,
  });
  assert.equal(netErrorStop({ ...failure, code: "ERR_CONNECTION_REFUSED", triesSoFar: 4 }).reason, exhaustedReason);
});

test("a network failure during a fill or import always holds for review", () => {
  for (const code of [...transientCodes, dnsCode]) {
    for (const inFlight of ["fillInFlight", "importInFlight"] as const) {
      for (const triesSoFar of [1, 4]) {
        assert.deepEqual(netErrorStop({ ...firstFailure, code, runner: "vps", triesSoFar, [inFlight]: true }), {
          verdict: "hold", reason: "The site may be half done", countsAsDone: false,
        });
      }
    }
  }
});

test("other browser codes and subframe failures go to other rules", () => {
  for (const code of [
    "ERR_CERT_DATE_INVALID", "net::err_cert_authority_invalid", "ERR_SSL_PROTOCOL_ERROR",
    "ERR_BLOCKED_BY_CLIENT", "ERR_ABORTED", "ERR_UNKNOWN", "", undefined,
  ]) {
    assert.equal(netErrorStop({ ...firstFailure, code, fillInFlight: true }).verdict, "not_network");
  }
  assert.equal(netErrorStop({ ...firstFailure, mainFrame: false }).verdict, "not_network");
});

test("the prefix and letter case have no effect on recognized codes", () => {
  for (const code of [...transientCodes, dnsCode]) {
    const plain = netErrorStop({ ...firstFailure, code });
    for (const variant of [`net::${code}`, code.toLowerCase(), `NeT::${code.toLowerCase()}`]) {
      assert.deepEqual(netErrorStop({ ...firstFailure, code: variant }), plain);
    }
  }
});

test("invalid try counts use the same decision as an exhausted count", () => {
  for (const code of [firstFailure.code, dnsCode, "ERR_INTERNET_DISCONNECTED"]) {
    const facts = { ...firstFailure, code, runner: "vps" } as const;
    const exhausted = netErrorStop({ ...facts, triesSoFar: 4 });
    assert.equal(exhausted.verdict, "hold");
    for (const triesSoFar of [-1, 0, 1.5, NaN, Infinity, "1", null, undefined, Symbol()]) {
      assert.deepEqual(netErrorStop({ ...facts, triesSoFar } as NetErrorFacts), exhausted);
    }
  }
});

test("bad load facts return a decision without throwing or coercing the code", () => {
  for (const facts of [undefined, null, 1, "ERR_TIMED_OUT", [], {},
    { ...firstFailure, code: Symbol() },
    { ...firstFailure, get code() { throw new Error("unreadable code"); } },
  ]) {
    assert.equal(netErrorStop(facts as NetErrorFacts).verdict, "not_network");
  }
});

test("decisions never count as done or expose the address, query or page text", () => {
  const url = "https://address-canary.invalid/?value=query-canary";
  const pageText = "page-text-canary";
  for (const facts of [firstFailure, { ...firstFailure, triesSoFar: 4 }, { ...firstFailure, code: url }]) {
    const result = netErrorStop(Object.freeze({ ...facts, url, pageText }));
    assert.equal(result.countsAsDone, false);
    assert.ok(result.reason.trim());
    assert.doesNotMatch(JSON.stringify(result), /address-canary|query-canary|page-text-canary/);
  }
});
