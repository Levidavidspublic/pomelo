import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PAGE_MASK_AGE_MS,
  pageReadRelease,
  type PageMaskPass,
  type PageRead,
  type PageReadReleaseReason,
} from "../src/pomelo/browser/page-read-release.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";
import { MASK } from "../src/pomelo/mask.js";

const now = 2500;
const read: PageRead = {
  jobId: "job-1",
  pageId: "page-1",
  navigationId: 7,
  url: "https://example.test/form?view=first",
  readAt: 2000,
  frameIds: ["top", "child"],
  text: `Password: ${MASK}`,
  hasSecretFields: true,
};
const pass: PageMaskPass = {
  jobId: read.jobId,
  pageId: read.pageId,
  navigationId: read.navigationId,
  frameIds: ["top", "child"],
  maskedAt: 2000,
  knownCount: 1,
};
const maskOff = { site: "example.test", until: 3000 };

const refusals: {
  name: string;
  reason: PageReadReleaseReason;
  readChange?: Partial<PageRead>;
  passChange?: Partial<PageMaskPass> | null;
}[] = [
  { name: "a missing mask pass", reason: "no-mask-pass", passChange: null },
  { name: "a pass with an invalid known count", reason: "no-mask-pass", passChange: { knownCount: NaN } },
  { name: "a pass from another job", reason: "other-job", passChange: { jobId: "job-2" } },
  { name: "a pass from another page", reason: "page-changed", passChange: { pageId: "page-2" } },
  { name: "a pass from another navigation", reason: "page-changed", passChange: { navigationId: 8 } },
  { name: "a frame the pass did not cover", reason: "frames-changed", passChange: { frameIds: ["top"] } },
  { name: "a pass older than the read", reason: "stale", passChange: { maskedAt: 1999 } },
  {
    name: "a pass more than 1000 ms old",
    reason: "stale",
    readChange: { readAt: 1499 },
    passChange: { maskedAt: 1499 },
  },
  { name: "a pass dated after the release check", reason: "stale", passChange: { maskedAt: 2501 } },
  { name: "mask-off on a page with a password field", reason: "mask-off-secret-fields", readChange: { maskOff } },
  {
    name: "mask-off at the expiry time",
    reason: "mask-off-expired",
    readChange: { maskOff: { ...maskOff, until: now }, hasSecretFields: false },
  },
  {
    name: "mask-off on a subdomain of the allowed site",
    reason: "page-changed",
    readChange: { url: "https://child.example.test/form", maskOff, hasSecretFields: false },
  },
  {
    name: "mask-off at a different port",
    reason: "page-changed",
    readChange: { url: "https://example.test:8443/form", maskOff, hasSecretFields: false },
  },
  {
    name: "mask-off with an invalid page address",
    reason: "page-changed",
    readChange: { url: "invalid address", maskOff, hasSecretFields: false },
  },
  { name: "known masks with no marker in the text", reason: "marker-missing", readChange: { text: "Page text" } },
  {
    name: "known masks with no marker even during a mask-off allowance",
    reason: "marker-missing",
    readChange: { maskOff, hasSecretFields: false, text: "Page text" },
  },
];

test("releases a covered page read with its text", () => {
  assert.deepEqual(pageReadRelease(read, pass, now), { release: true, text: read.text });
});

test("accepts a pass that covers extra frames and lists them in a different order", () => {
  const coveringPass = { ...pass, frameIds: ["child", "extra", "top"] };
  assert.deepEqual(pageReadRelease(read, coveringPass, now), { release: true, text: read.text });
});

test("accepts a pass made after the read and a pass exactly 1000 ms old", () => {
  assert.equal(MAX_PAGE_MASK_AGE_MS, 1000);
  assert.deepEqual(pageReadRelease(read, { ...pass, maskedAt: 2100 }, now), { release: true, text: read.text });
  assert.deepEqual(pageReadRelease({ ...read, readAt: 1500 }, { ...pass, maskedAt: 1500 }, now), {
    release: true,
    text: read.text,
  });
});

test("releases a mask-off read on the exact site while the allowance is active and the page has no secret fields", () => {
  const unmasked = { ...read, maskOff, hasSecretFields: false, text: "Page text" };
  assert.deepEqual(pageReadRelease(unmasked, { ...pass, knownCount: 0 }, 2999), {
    release: true,
    text: unmasked.text,
  });
});

for (const { name, reason, readChange, passChange } of refusals) {
  test(`refuses ${name}`, () => {
    const decision = pageReadRelease({ ...read, ...readChange }, passChange === null ? null : { ...pass, ...passChange }, now);
    assert.equal(decision.release, false);
    assert.deepEqual(decision, { release: false, reason, message: decision.message });
    assert.match(decision.message, /\S/);
  });
}

test("refuses non-finite timing for a read, a pass or a mask-off allowance", () => {
  assert.equal(pageReadRelease({ ...read, readAt: NaN }, pass, now).release, false);
  assert.equal(pageReadRelease(read, { ...pass, maskedAt: Infinity }, now).release, false);
  assert.equal(pageReadRelease(read, pass, NaN).release, false);
  const unmasked = { ...read, maskOff: { ...maskOff, until: Infinity }, hasSecretFields: false, text: "Page text" };
  assert.equal(pageReadRelease(unmasked, { ...pass, knownCount: 0 }, now).release, false);
});

test("keeps the synthetic canary out of every refusal", () => {
  const canary = 'pomelo read canary +/& "794"';
  for (const { name, reason, readChange, passChange } of refusals) {
    const pageRead = { ...read, ...readChange };
    const maskPass = passChange === null ? null : { ...pass, ...passChange };
    const decision = pageReadRelease({
      ...pageRead,
      text: `${pageRead.text} ${canary}`,
      url: `${pageRead.url}${pageRead.url.includes("?") ? "&" : "?"}view=${encodeURIComponent(canary)}`,
    }, maskPass, now);

    assertNoCanary(canary, { [name]: JSON.stringify(decision) });
    assert.equal(decision.release, false, name);
    assert.equal(decision.reason, reason, name);
    assert.deepEqual(decision, pageReadRelease(pageRead, maskPass, now), name);
  }
});
