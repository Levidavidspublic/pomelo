import assert from "node:assert/strict";
import { register } from "node:module";
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

test("releases a page when none of the supplied known values appear", () => {
  const { read, maskPass } = successfulRead({
    ...input([{ role: "heading", text: "Example page" }]),
    knownSecrets: [canary],
  });
  assert.equal(read.text, "Example page");
  assert.equal(maskPass.knownCount, 0);
});

test("replaces a password field value even when it is absent from the known values", () => {
  const { read, maskPass } = successfulRead(input([field(canary)]));
  assert.deepEqual(sweepForCanary(canary, { read: JSON.stringify(read) }), []);
  assert.equal(read.text, `Password ${MASK}`);
  assert.equal(read.hasSecretFields, true);
  assert.equal(maskPass.knownCount, 1);
});

test("keeps an ordinary field's value visible", () => {
  const { read } = successfulRead(input([
    { role: "textbox", text: "Display name", field: { type: "text", value: "Example" } },
  ]));
  assert.equal(read.text, "Display name Example");
  assert.equal(read.hasSecretFields, false);
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

test("uses each frame's own decision when the planner reorders its results", async () => {
  const readerUrl = new URL("../src/pomelo/browser/masked-read.ts?reordered-frames", import.meta.url).href;
  const plannerUrl = new URL("../src/pomelo/browser/frame-read.ts", import.meta.url).href;
  const reorderedPlanner = `
    import { planFrameRead as plan } from ${JSON.stringify(plannerUrl)};
    export const planFrameRead = (...args) => plan(...args).reverse();
  `;
  // Depending on how tsx registers its loader, the hook sees the original import or its TS path.
  const loader = `
    export function resolve(specifier, context, nextResolve) {
      if (context.parentURL === ${JSON.stringify(readerUrl)} &&
          (specifier === "./frame-read.js" || new URL(specifier, context.parentURL).href === ${JSON.stringify(plannerUrl)})) {
        return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(reorderedPlanner)}`)}, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    }
  `;
  register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);
  const { maskedPageRead: readWithReorderedDecisions } = await import(readerUrl) as
    typeof import("../src/pomelo/browser/masked-read.js");
  const request = input([{ role: "heading", text: "Example page" }]);
  const result = readWithReorderedDecisions({
    ...request,
    scope: { ...scope, frameIds: ["top", "embed"] },
    frames: [...request.frames, {
      ...thirdParty,
      get elements(): never {
        throw new Error("Excluded elements were read");
      },
    }],
  });
  assert.ok("read" in result, "the reordered decisions should yield a masked page read");
  assert.equal(result.read.text, `${thirdPartyMarker}\nExample page`);
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

test("releases the visible prefix when trimming removes every masked line", () => {
  const result = successfulRead({
    ...input([{ role: "heading", text: "Example page" }, field(canary), { role: "text", text: canary }]),
    knownSecrets: [canary],
    maxChars: "Example page".length,
  });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.equal(result.read.text, "Example page");
  assert.equal(result.read.hasSecretFields, true);
  assert.equal(result.maskPass.knownCount, 0);
});

test("counts the values replaced in the released text", () => {
  const expected = `${MASK}\nValue ${MASK} ${MASK}`;
  const result = successfulRead({
    ...input([
      { role: "text", text: MASK },
      { role: "text", text: `Value ${canary} ${canary}` },
      { role: "text", text: canary },
    ]),
    scope: { ...scope, url: `${url}?view=${encodeURIComponent(canary)}` },
    knownSecrets: [canary],
    maxChars: expected.length,
  });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.equal(result.read.text, expected);
  assert.equal(result.maskPass.knownCount, 2);
});

test("counts the redactions in a role-only line", () => {
  const result = successfulRead({
    ...input([{ role: canary, text: `Value ${canary} ${canary}` }]),
    knownSecrets: [canary],
    maxChars: MASK.length,
  });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.equal(result.read.text, MASK);
  assert.equal(result.maskPass.knownCount, 1);
});

test("the serialized read and pass contain no canary in any swept form", () => {
  const request = input([
    field(canary),
    { role: "text", text: `${canary} ${Buffer.from(canary).toString("base64")}`, displayed: false },
    { role: "text", text: `Value: ${canary} ${encodeURIComponent(canary)}` },
    { role: "link", text: "More" },
  ]);
  const expected = `${thirdPartyMarker}\nPassword ${MASK}\n${HIDDEN_TEXT_MARKER}\nValue: ${MASK} ${MASK}`;
  const pageUrl = `${url}?view=${encodeURIComponent(canary)}`;
  const result = successfulRead({
    ...request,
    scope: { ...scope, frameIds: ["top", "embed"], url: pageUrl },
    frames: [
      { ...thirdParty, elements: [{ role: "text", text: `${canary} ${Buffer.from(canary).toString("hex")}` }] },
      { ...request.frames[0], url: pageUrl },
    ],
    knownSecrets: [canary],
    maxChars: expected.length,
  });
  assert.deepEqual(sweepForCanary(canary, { result: JSON.stringify(result) }), []);
  assert.equal(result.read.text, expected);
});
