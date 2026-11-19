const MOTION = Object.freeze({
  minDurationMs: 120,
  maxDurationMs: 180,
  disabledDurationMs: 0,
  easing: "easeOut",
  iterations: 1,
  durations: Object.freeze({
    "card-arrive": 150,
    "panel-open": 180,
    "rail-move": 160,
    fold: 140,
    "badge-change": 120,
  }),
});

export type MotionKind = keyof typeof MOTION.durations;

export function motionFor(kind: string, { reducedMotion }: { reducedMotion: boolean }) {
  const durationMs = Object.hasOwn(MOTION.durations, kind)
    ? MOTION.durations[kind as MotionKind]
    : MOTION.minDurationMs;

  return {
    durationMs: reducedMotion ? MOTION.disabledDurationMs : durationMs,
    easing: MOTION.easing,
    iterations: MOTION.iterations,
  };
}

type MotionSpec = { durationMs: number; iterations: number; name: string };
type MotionViolation = "too-long" | "too-short" | "loops" | "pulse";

/** A zero duration is valid for disabled motion. */
export function checkMotion({ durationMs, iterations, name }: MotionSpec): MotionViolation[] {
  const violations: MotionViolation[] = [];

  if (Number.isNaN(durationMs) || durationMs > MOTION.maxDurationMs) {
    violations.push("too-long");
  } else if (durationMs !== MOTION.disabledDurationMs && durationMs < MOTION.minDurationMs) {
    violations.push("too-short");
  }
  if (iterations > MOTION.iterations) violations.push("loops");
  if (/pulse|blink|bounce|ping|spin/i.test(name)) violations.push("pulse");

  return violations;
}
