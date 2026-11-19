import assert from "node:assert/strict";
import test from "node:test";
import { checkMotion, motionFor, type MotionKind } from "../src/client/pomelo/motion.js";

const kinds: MotionKind[] = ["card-arrive", "panel-open", "rail-move", "fold", "badge-change"];
const validMotion = { name: "card-arrive", durationMs: 150, iterations: 1 };

test("every Pomelo motion runs once and lasts 120–180 ms", () => {
  for (const kind of kinds) {
    const motion = motionFor(kind, { reducedMotion: false });
    assert.ok(motion.durationMs >= 120 && motion.durationMs <= 180, kind);
    assert.equal(motion.iterations, 1, kind);
    assert.equal(motion.easing, "easeOut", kind);
    assert.deepEqual(checkMotion({ ...motion, name: kind }), [], kind);
  }
});

test("reduced motion makes every Pomelo motion instantaneous", () => {
  for (const kind of kinds) {
    const motion = motionFor(kind, { reducedMotion: true });
    assert.equal(motion.durationMs, 0, kind);
    assert.deepEqual(checkMotion({ ...motion, name: kind }), [], kind);
  }
});

test("unknown motion kinds fall back to the shortest motion and respect reduced motion", () => {
  for (const kind of ["new-motion", "constructor", "__proto__"]) {
    assert.deepEqual(motionFor(kind, { reducedMotion: false }), {
      durationMs: 120,
      easing: "easeOut",
      iterations: 1,
    }, kind);
    assert.equal(motionFor(kind, { reducedMotion: true }).durationMs, 0, kind);
  }
});

test("the motion check accepts both duration limits and flags timings outside them", () => {
  assert.deepEqual(checkMotion({ ...validMotion, durationMs: 120 }), []);
  assert.deepEqual(checkMotion({ ...validMotion, durationMs: 180 }), []);
  assert.deepEqual(checkMotion({ ...validMotion, durationMs: 119 }), ["too-short"]);
  assert.deepEqual(checkMotion({ ...validMotion, durationMs: 181 }), ["too-long"]);
});

test("the motion check refuses non-finite durations", () => {
  assert.deepEqual(checkMotion({ ...validMotion, durationMs: Infinity }), ["too-long"]);
  assert.deepEqual(checkMotion({ ...validMotion, durationMs: -Infinity }), ["too-short"]);
  assert.deepEqual(checkMotion({ ...validMotion, durationMs: NaN }), ["too-long"]);
});

test("the motion check flags repeated and infinite iterations", () => {
  for (const iterations of [1.5, 2, Infinity]) {
    assert.deepEqual(checkMotion({ ...validMotion, iterations }), ["loops"]);
  }
});

test("the motion check flags each pulse keyword anywhere in the name", () => {
  for (const word of ["pulse", "blink", "bounce", "ping", "spin"]) {
    const name = `badge${word.toUpperCase()}In`;
    assert.deepEqual(checkMotion({ ...validMotion, name }), ["pulse"], name);
  }
});

test("the motion check reports every violation in a spec", () => {
  assert.deepEqual(checkMotion({ name: "card-spin", durationMs: 200, iterations: 2 }), [
    "too-long",
    "loops",
    "pulse",
  ]);
});
