import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FRAME_READ_COUNT, MAX_FRAME_READ_DEPTH, planFrameRead } from "../src/pomelo/browser/frame-read.js";

const page = "https://page.test/index";
const top = { id: "top", parentId: null, url: page, hasSecretField: false, textLength: 100 };

function child(id: string, url = page, parentId = top.id) {
  return { id, parentId, url, hasSecretField: false, textLength: 0 };
}

test("reads the top frame and same-origin children", () => {
  const frames = [top, child("same", "https://page.test/details"), child("port", "https://page.test:8443/details")];
  const result = planFrameRead(page, frames, []);

  assert.deepEqual(result.map(({ decision }) => decision), ["read", "read", "skip"]);
  assert.equal(result[2].marker, "[frame from page.test left out]");
  assert.equal(planFrameRead("about:blank", [{ ...top, url: "about:blank" }], [])[0].decision, "read");

  const httpPage = "http://page.test/";
  const httpResult = planFrameRead(httpPage, [{ ...top, url: httpPage }, child("http-same", httpPage)], []);
  assert.deepEqual(httpResult.map(({ decision }) => decision), ["read", "read"]);
});

test("allows scoped HTTPS hosts and subdomains while leaving out HTTP and look-alike hosts", () => {
  const frames = [
    top,
    child("scoped", "https://partner.test/"),
    child("subdomain", "https://widgets.partner.test/"),
    child("http", "http://partner.test/"),
    child("look-alike", "https://partner.test.evil.test/"),
    child("no-label-boundary", "https://otherpartner.test/"),
  ];
  const result = planFrameRead(page, frames, ["PARTNER.TEST."]);

  assert.deepEqual(result.map(({ decision }) => decision), ["read", "read", "read", "skip", "skip", "skip"]);
  assert.equal(result[3].marker, "[frame from partner.test left out]");
  assert.equal(result[4].marker, "[frame from partner.test.evil.test left out]");
});

test("leaves out embedded and invalid addresses with a generic marker", () => {
  const addresses = ["data:text/plain,embedded", "blob:https://page.test/embedded", "javascript:void(0)", "file:///embedded", "about:srcdoc", "bad address"];
  const result = planFrameRead(page, [top, ...addresses.map((url, index) => child(`frame-${index}`, url))], []);

  assert.deepEqual(result.slice(1).map(({ decision, marker }) => ({ decision, marker })),
    addresses.map(() => ({ decision: "skip", marker: "[embedded frame left out]" })));
});

test("skips descendants of a skipped parent and returns results in input order", () => {
  const frames = [
    child("grandchild", page, "outside"),
    child("allowed-grandchild", page, "same"),
    child("outside", "https://ads.test/"),
    top,
    child("same"),
  ];
  const result = planFrameRead(page, frames, []);

  assert.deepEqual(result.map(({ id }) => id), frames.map(({ id }) => id));
  assert.deepEqual(result.map(({ decision }) => decision), ["skip", "read", "skip", "read", "read"]);
  assert.equal(result[0].reason, "parent frame was left out");
  assert.equal(result[2].marker, "[frame from ads.test left out]");
});

test("skips frames past the depth limit", () => {
  const chain = Array.from({ length: MAX_FRAME_READ_DEPTH + 1 }, (_, index) =>
    child(`depth-${index + 1}`, page, index === 0 ? top.id : `depth-${index}`));
  const result = planFrameRead(page, [top, ...chain], []);

  assert.ok(result.slice(0, -1).every(({ decision }) => decision === "read"));
  assert.deepEqual(result.at(-1), {
    id: `depth-${MAX_FRAME_READ_DEPTH + 1}`, decision: "skip", reason: "frame depth limit reached",
  });
});

test("counts the top frame toward the page limit even when it is listed last", () => {
  const children = Array.from({ length: MAX_FRAME_READ_COUNT + 1 }, (_, index) => child(`frame-${index}`));
  const result = planFrameRead(page, [...children, top], []);

  assert.equal(result.filter(({ decision }) => decision === "read").length, MAX_FRAME_READ_COUNT);
  assert.ok(result.slice(0, MAX_FRAME_READ_COUNT - 1).every(({ decision }) => decision === "read"));
  assert.deepEqual(result.slice(MAX_FRAME_READ_COUNT - 1, -1).map(({ decision, reason }) => [decision, reason]), [
    ["skip", "frame count limit reached"],
    ["skip", "frame count limit reached"],
  ]);
  assert.equal(result.at(-1)?.decision, "read");
});

test("skips frames with missing or looping parent links", () => {
  const frames = [top, child("orphan", page, "missing"), child("loop-a", page, "loop-b"), child("loop-b", page, "loop-a")];
  const result = planFrameRead(page, frames, []);

  assert.deepEqual(result.map(({ decision }) => decision), ["read", "skip", "skip", "skip"]);
});

test("a skipped sign-in or payment frame gets the hold reason and keeps its marker", () => {
  const frames = [
    top,
    { ...child("sign-in", "https://account.test/"), hasSecretField: true },
    { ...child("payment", "about:srcdoc"), hasSecretField: true },
  ];

  assert.deepEqual(planFrameRead(page, frames, []).slice(1), [
    { id: "sign-in", decision: "skip", reason: "holds a sign-in or payment field", marker: "[frame from account.test left out]" },
    { id: "payment", decision: "skip", reason: "holds a sign-in or payment field", marker: "[embedded frame left out]" },
  ]);
});

test("the frame-read result excludes the canary in a skipped frame's path and query", () => {
  const canary = "CANARY-FRAME-7f3a";
  const frames = [top, child("outside", `https://ads.test:8443/${canary}?message=${canary}`)];
  const result = planFrameRead(page, frames, []);

  assert.equal(result[1].decision, "skip");
  assert.equal(result[1].marker, "[frame from ads.test left out]");
  assert.equal(JSON.stringify(result).includes(canary), false);
});
