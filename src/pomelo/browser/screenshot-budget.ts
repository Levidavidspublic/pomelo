export interface ScreenshotBudgetRequest {
  stepId: string;
  width: number;
  height: number;
  byteLength: number;
}

/** Counts for one job. Start with both counts at zero and no step ID. */
export interface ScreenshotBudgetUsed {
  stepId?: string;
  stepCount: number;
  jobCount: number;
}

export interface ScreenshotBudgetLimits {
  maxPerStep: number;
  maxPerJob: number;
  maxPixels: number;
  maxBytes: number;
}

export const DEFAULT_SCREENSHOT_BUDGET: Readonly<ScreenshotBudgetLimits> = Object.freeze({
  maxPerStep: 1,
  maxPerJob: 8,
  maxPixels: 1_048_576,
  maxBytes: 1_048_576,
});

interface BudgetResult {
  reason: string;
  used: ScreenshotBudgetUsed;
}

export type ScreenshotBudgetResult = BudgetResult & (
  | { decision: "send" | "use_page_read" | "hold" }
  | { decision: "downscale"; targetWidth: number; targetHeight: number }
);

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function fitDimensions(width: bigint, height: bigint, maxPixels: bigint) {
  const landscape = width >= height;
  const longSide = landscape ? width : height;
  const shortSide = landscape ? height : width;
  // Round the short side to the nearest pixel, with a minimum of one pixel.
  const scaledShortSide = (scaledLongSide: bigint) => (shortSide * scaledLongSide + longSide / 2n) / longSide || 1n;

  let low = 1n;
  let high = longSide;
  while (low < high) {
    const middle = (low + high + 1n) / 2n;
    if (middle * scaledShortSide(middle) <= maxPixels) low = middle;
    else high = middle - 1n;
  }

  const short = scaledShortSide(low);
  return { targetWidth: Number(landscape ? low : short), targetHeight: Number(landscape ? short : low) };
}

/**
 * Check one candidate and return the counts to carry forward for this job.
 * If resizing, check the actual encoded byte length before sending the image.
 */
export function checkScreenshotBudget(
  { stepId, width, height, byteLength }: Readonly<ScreenshotBudgetRequest>,
  used: Readonly<ScreenshotBudgetUsed>,
  {
    maxPerStep = DEFAULT_SCREENSHOT_BUDGET.maxPerStep,
    maxPerJob = DEFAULT_SCREENSHOT_BUDGET.maxPerJob,
    maxPixels = DEFAULT_SCREENSHOT_BUDGET.maxPixels,
    maxBytes = DEFAULT_SCREENSHOT_BUDGET.maxBytes,
  }: Readonly<Partial<ScreenshotBudgetLimits>> = {},
): ScreenshotBudgetResult {
  if (![width, height, byteLength].every(positiveInteger)) {
    return {
      decision: "hold",
      reason: "Screenshot width, height, and byte length must be positive whole numbers within the supported range.",
      used: { ...used },
    };
  }
  if (!validCount(maxPerStep) || !validCount(maxPerJob) || !positiveInteger(maxPixels) || !positiveInteger(maxBytes)) {
    return { decision: "hold", reason: "The screenshot budget has an invalid limit.", used: { ...used } };
  }
  if (!validCount(used.stepCount) || !validCount(used.jobCount)) {
    return { decision: "hold", reason: "The screenshot budget has an invalid count.", used: { ...used } };
  }
  if (used.jobCount >= maxPerJob) {
    return { decision: "hold", reason: "The job reached its screenshot limit. Hold for Amit.", used: { ...used } };
  }

  const stepCount = used.stepId === stepId ? used.stepCount : 0;
  if (stepCount >= maxPerStep) {
    return { decision: "use_page_read", reason: "The step reached its screenshot limit. Use a masked page read.", used: { ...used } };
  }

  const nextUsed = { stepId, stepCount: stepCount + 1, jobCount: used.jobCount + 1 };
  const widthPixels = BigInt(width);
  const heightPixels = BigInt(height);
  const pixels = widthPixels * heightPixels;
  const pixelLimit = BigInt(maxPixels);
  const overPixelLimit = pixels > pixelLimit;
  const overByteLimit = byteLength > maxBytes;
  if (!overPixelLimit && !overByteLimit) {
    return { decision: "send", reason: "The screenshot is within budget.", used: nextUsed };
  }

  // Estimate the byte limit by keeping bytes per pixel constant.
  const pixelsByBytes = overByteLimit ? (pixels * BigInt(maxBytes)) / BigInt(byteLength) : pixels;
  const targetPixels = pixelsByBytes < pixelLimit ? pixelsByBytes : pixelLimit;
  const sizeLimit = overPixelLimit && overByteLimit ? "pixel and byte limits" : overPixelLimit ? "pixel limit" : "byte limit";
  return {
    decision: "downscale",
    reason: `The screenshot exceeds the ${sizeLimit}.`,
    ...fitDimensions(widthPixels, heightPixels, targetPixels || 1n),
    used: nextUsed,
  };
}
