import assert from "node:assert/strict";
import test from "node:test";
import { checkTabOpen } from "../src/pomelo/browser/tab-rule.js";

const job = { source: "job", url: "https://example.invalid/start" } as const;
const popup = {
  source: "page",
  url: "https://example.invalid/details",
  openerUrl: "https://example.invalid/start",
} as const;

test("the job can open its first tab and its fifth tab", () => {
  for (const openTabs of [0, 4]) {
    const result = checkTabOpen({ openTabs, request: job });
    assert.equal(result.decision, "allow");
    assert.ok(result.reason);
  }
});

test("the tab limit holds both job requests and same-site pop-ups", () => {
  for (const request of [job, popup]) {
    const result = checkTabOpen({ openTabs: 5, request });
    assert.equal(result.decision, "hold");
    assert.match(result.reason, /limit of 5 open tabs/i);
  }
});

test("a job can use a custom tab limit", () => {
  const limits = { maxTabs: 2 };
  assert.equal(checkTabOpen({ openTabs: 1, request: job, limits }).decision, "allow");
  const result = checkTabOpen({ openTabs: 2, request: job, limits });
  assert.equal(result.decision, "hold");
  assert.match(result.reason, /limit of 2 open tabs/i);
});

test("a same-site pop-up is allowed within the tab limit", () => {
  assert.equal(checkTabOpen({ openTabs: 4, request: popup }).decision, "allow");
});

test("scheme and host are compared without regard to case", () => {
  const request = { ...popup, openerUrl: "HTTPS://EXAMPLE.INVALID/start" };
  assert.equal(checkTabOpen({ openTabs: 1, request }).decision, "allow");
});

for (const [difference, url] of [
  ["host", "https://other.invalid/details"],
  ["scheme", "http://example.invalid/details"],
  ["port", "https://example.invalid:8443/details"],
]) {
  test(`a pop-up with a different ${difference} is held for approval`, () => {
    const result = checkTabOpen({ openTabs: 1, request: { ...popup, url } });
    assert.equal(result.decision, "hold");
    assert.match(result.reason, /different site.*approval/i);
  });
}

for (const url of [
  "file:///example.txt",
  "javascript:void(0)",
  "data:text/plain,example",
  "chrome://settings",
  "about:blank",
]) {
  test(`refuses the ${url.split(":")[0]} scheme`, () => {
    const result = checkTabOpen({ openTabs: 1, request: { ...job, url } });
    assert.equal(result.decision, "refuse");
    assert.match(result.reason, /http and https/i);
  });
}

test("refuses an empty or malformed address even at the tab limit", () => {
  for (const url of ["", "   ", "not an address", "https://[invalid]"]) {
    const result = checkTabOpen({ openTabs: 5, request: { ...job, url } });
    assert.equal(result.decision, "refuse");
    assert.match(result.reason, /valid address/i);
  }
});

test("holds a pop-up if its opener has no usable web address", () => {
  for (const request of [
    { source: "page", url: popup.url } as const,
    { ...popup, openerUrl: "not an address" },
    { ...popup, openerUrl: "about:blank" },
  ]) {
    const result = checkTabOpen({ openTabs: 1, request });
    assert.equal(result.decision, "hold");
    assert.match(result.reason, /opener/i);
  }
});
