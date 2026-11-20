import assert from "node:assert/strict";
import test from "node:test";
import { HIDDEN_TEXT_MARKER } from "../src/pomelo/browser/hidden-text.js";
import { maskedPageRead, type MaskedPageReadInput } from "../src/pomelo/browser/masked-read.js";
import { pageReadRelease } from "../src/pomelo/browser/page-read-release.js";
import { sweepForCanary } from "../src/pomelo/canary-sweep.js";
import { MASK } from "../src/pomelo/mask.js";

const now = 2500;
const url = "https://example.test/page";
const scope = { jobId: "job-1", pageId: "page-1", navigationId: 7, frameIds: ["top"], url, readAt: 2400 };
const top = { id: "top", parentId: null, url, hasSecretField: false, textLength: 100 };
const thirdParty = { id: "embed", parentId: "top", url: "https://elsewhere.test/", hasSecretField: false, textLength: 100 };
const thirdPartyMarker = "[frame from elsewhere.test left out]";
const canary = ["synthetic", 'read +"\\', "🔎"].join("-");
const field = (value: string) => ({ role: "textbox", text: "Password", field: { type: "password", value } });

function input(elements: MaskedPageReadInput["frames"][number]["elements"]): MaskedPageReadInput {
  return { scope, now, frames: [{ ...top, elements }], siteScope: [], knownSecrets: [] };
}

function successfulRead(request: MaskedPageReadInput) {
  const result = maskedPageRead(request);
  assert.ok("read" in result, "the masked page read should succeed");
  assert.deepEqual(pageReadRelease(result.read, result.maskPass, request.now), { release: true, text: result.read.text });
  return result;
}

test("returns plain page text with a fresh pass for the captured scope", () => {
  const { read, maskPass } = successfulRead(input([{ role: "heading", text: "Example page" }]));
  assert.deepEqual(read, { ...scope, text: "Example page", hasSecretFields: false });
  assert.deepEqual(maskPass, {
    jobId: scope.jobId,
    pageId: scope.pageId,
    navigationId: scope.navigationId,
    frameIds: scope.frameIds,
    maskedAt: now,
    knownCount: 0,
  });
});

test("replaces a password field value even when it is absent from the known values", () => {
  const { read } = successfulRead(input([field(canary)]));
  assert.deepEqual(sweepForCanary(canary, { read: JSON.stringify(read) }), []);
  assert.equal(read.text, `Password ${MASK}`);
  assert.equal(read.hasSecretFields, true);
});

test("replaces display-none text in page order", () => {
  const { read } = successfulRead(input([
    { role: "heading", text: "Example page" },
    { role: "text", text: canary, displayed: false },
    { role: "link", text: "Next" },
  ]));
  assert.deepEqual(sweepForCanary(canary, { read: JSON.stringify(read) }), []);
  assert.equal(read.text, `Example page\n${HIDDEN_TEXT_MARKER}\nNext`);
});

test("emits the frame rule's marker without accessing third-party elements", () => {
  const request = input([{ role: "heading", text: "Example page" }]);
  const { read } = successfulRead({
    ...request,
    scope: { ...scope, frameIds: ["top", "embed"] },
    frames: [...request.frames, {
      ...thirdParty,
      get elements(): never {
        throw new Error("Excluded elements were read");
      },
    }],
  });
  assert.equal(read.text, `Example page\n${thirdPartyMarker}`);
});

test("trims a long read at whole-line boundaries and preserves a full mask marker", () => {
  const request = input([
    { role: "heading", text: "Example page" },
    field(canary),
    ...Array.from({ length: 100 }, () => ({ role: "link", text: "More" })),
  ]);
  const expected = `Example page\nPassword ${MASK}`;
  const exact = successfulRead({ ...request, maxChars: expected.length });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(exact) }), []);
  assert.equal(exact.read.text, expected);
  assert.equal(successfulRead({ ...request, maxChars: expected.length - 1 }).read.text, "Example page");
});

test("refuses a pass used with another page id", () => {
  const { read, maskPass } = successfulRead(input([{ role: "heading", text: "Example page" }]));
  const decision = pageReadRelease({ ...read, pageId: "page-2" }, maskPass, now);
  assert.equal(decision.release, false);
  if (!decision.release) assert.equal(decision.reason, "page-changed");
});

test("refuses to stamp a capture with a different frame set", () => {
  const result = maskedPageRead({
    ...input([{ role: "heading", text: canary }]),
    scope: { ...scope, frameIds: ["other-frame"] },
  });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.deepEqual(result, { reason: "Page read could not be masked safely." });
});

test("a thrown step returns a refusal without any page text", () => {
  const result = maskedPageRead(input([
    { role: "heading", text: canary },
    {
      role: "text",
      get text(): never {
        throw new Error("Element read failed");
      },
    },
  ]));
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.deepEqual(result, { reason: "Page read could not be masked safely." });
});

test("withholds the read when trimming removes the marker required by the release rule", () => {
  const result = maskedPageRead({
    ...input([{ role: "heading", text: "Example page" }, field(canary)]),
    knownSecrets: [canary],
    maxChars: "Example page".length,
  });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.deepEqual(result, { reason: "Page read could not be masked safely." });
});

test("the serialized read and pass contain no canary in any swept form", () => {
  const request = input([
    field(canary),
    { role: "text", text: Buffer.from(canary).toString("base64"), displayed: false },
    { role: "text", text: `Value: ${encodeURIComponent(canary)}` },
    { role: "link", text: "More" },
  ]);
  const expected = `${thirdPartyMarker}\nPassword ${MASK}\n${HIDDEN_TEXT_MARKER}\nValue: ${MASK}`;
  const pageUrl = `${url}?view=${encodeURIComponent(canary)}`;
  const result = successfulRead({
    ...request,
    scope: { ...scope, frameIds: ["top", "embed"], url: pageUrl },
    frames: [
      { ...thirdParty, elements: [{ role: "text", text: Buffer.from(canary).toString("hex") }] },
      { ...request.frames[0], url: pageUrl },
    ],
    knownSecrets: [canary],
    maxChars: expected.length,
  });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.equal(result.read.text, expected);
});
