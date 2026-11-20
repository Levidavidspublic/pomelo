import assert from "node:assert/strict";
import test from "node:test";
import { checkScreenshotBudget, DEFAULT_SCREENSHOT_BUDGET } from "../src/pomelo/browser/screenshot-budget.js";

const request = { stepId: "step-1", width: 800, height: 400, byteLength: 200_000 };
const unused = Object.freeze({ stepCount: 0, jobCount: 0 });

test("the first screenshot inside the default limits spends one screenshot from each count", () => {
  const result = checkScreenshotBudget(request, unused);

  assert.equal(result.decision, "send");
  assert.deepEqual(result.used, { stepId: "step-1", stepCount: 1, jobCount: 1 });
  assert.notEqual(result.used, unused);
  assert.deepEqual(unused, { stepCount: 0, jobCount: 0 });
});

test("pixel limits downscale landscape and portrait screenshots in proportion", () => {
  for (const [width, height] of [[1600, 800], [800, 1600]]) {
    const maxPixels = 320_000;
    const result = checkScreenshotBudget({ ...request, width, height }, unused, { maxPixels });

    assert.equal(result.decision, "downscale");
    assert.equal(result.targetWidth, width / 2);
    assert.equal(result.targetHeight, height / 2);
    assert.equal(result.targetWidth * height, result.targetHeight * width);
    assert.ok(result.targetWidth * result.targetHeight <= maxPixels);
    assert.deepEqual(result.used, { stepId: "step-1", stepCount: 1, jobCount: 1 });
  }
});

test("the byte limit alone can require a smaller target", () => {
  const result = checkScreenshotBudget(request, unused, { maxBytes: 50_000 });

  assert.equal(result.decision, "downscale");
  assert.equal(result.targetWidth, 400);
  assert.equal(result.targetHeight, 200);
  assert.match(result.reason, /byte/i);
});

test("when both size limits are exceeded the target fits the tighter limit", () => {
  for (const limits of [{ maxPixels: 80_000, maxBytes: 100_000 }, { maxPixels: 160_000, maxBytes: 50_000 }]) {
    const result = checkScreenshotBudget(request, unused, limits);

    assert.equal(result.decision, "downscale");
    assert.equal(result.targetWidth, 400);
    assert.equal(result.targetHeight, 200);
    assert.match(result.reason, /pixel and byte/i);
  }
});

test("the dimensions stay positive and within the pixel limit for very narrow images", () => {
  const result = checkScreenshotBudget({ ...request, width: 1, height: 500 }, unused, { maxPixels: 3 });

  assert.equal(result.decision, "downscale");
  assert.equal(result.targetWidth, 1);
  assert.equal(result.targetHeight, 3);
});

test("a step at its screenshot limit falls back to a masked page read without spending either count", () => {
  const used = Object.freeze({ stepId: request.stepId, stepCount: DEFAULT_SCREENSHOT_BUDGET.maxPerStep, jobCount: 2 });
  const result = checkScreenshotBudget(request, used);

  assert.equal(result.decision, "use_page_read");
  assert.match(result.reason, /masked page read/i);
  assert.deepEqual(result.used, used);
  assert.notEqual(result.used, used);
});

test("the job limit takes precedence even when the step limit is also reached", () => {
  const used = Object.freeze({ stepId: request.stepId, stepCount: 1, jobCount: 2 });
  const limits = { maxPerStep: 1, maxPerJob: 2 };

  for (const stepId of [request.stepId, "step-2"]) {
    const result = checkScreenshotBudget({ ...request, stepId }, used, limits);

    assert.equal(result.decision, "hold");
    assert.match(result.reason, /job.*limit/i);
    assert.deepEqual(result.used, used);
    assert.notEqual(result.used, used);
  }
});

test("a new step resets only its own count", () => {
  const used = Object.freeze({ stepId: request.stepId, stepCount: 2, jobCount: 3 });
  const limits = { maxPerStep: 2, maxPerJob: 5 };
  const next = { ...request, stepId: "step-2" };

  const first = checkScreenshotBudget(next, used, limits);
  assert.equal(first.decision, "send");
  assert.deepEqual(first.used, { stepId: "step-2", stepCount: 1, jobCount: 4 });
  assert.deepEqual(used, { stepId: "step-1", stepCount: 2, jobCount: 3 });

  const second = checkScreenshotBudget(next, first.used, limits);
  assert.equal(second.decision, "send");
  assert.deepEqual(second.used, { stepId: "step-2", stepCount: 2, jobCount: 5 });
  assert.equal(checkScreenshotBudget(next, second.used, limits).decision, "hold");
});

test("invalid screenshot sizes hold with a plain reason and leave the counts alone", () => {
  for (const field of ["width", "height", "byteLength"] as const) {
    for (const value of [0, -1, 1.5, NaN, Infinity, "100"]) {
      const result = checkScreenshotBudget({ ...request, [field]: value as number }, unused);

      assert.equal(result.decision, "hold");
      assert.match(result.reason, /width, height, and byte length.*positive whole numbers/i);
      assert.deepEqual(result.used, unused);
    }
  }
});

test("custom limits allow exact size boundaries and can forbid screenshots", () => {
  const limits = { maxPerStep: 3, maxPerJob: 10, maxPixels: 320_000, maxBytes: 200_000 };
  const used = Object.freeze({ stepId: request.stepId, stepCount: 2, jobCount: 8 });
  const result = checkScreenshotBudget(request, used, limits);

  assert.equal(result.decision, "send");
  assert.deepEqual(result.used, { stepId: "step-1", stepCount: 3, jobCount: 9 });
  assert.equal(checkScreenshotBudget(request, unused, { maxPerStep: 0 }).decision, "use_page_read");
  assert.equal(checkScreenshotBudget(request, unused, { maxPerJob: 0 }).decision, "hold");
});
