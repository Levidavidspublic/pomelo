import assert from "node:assert/strict";
import test from "node:test";
import { checkPhaseExit } from "../src/pomelo/phase-exit.js";

const phase0 = {
  npmTestPassed: true,
  smokeOpensApp: true,
  failingPrBlocked: true,
  pauseFileStopsMerge: true,
};

const phase1 = {
  flows: { F1: true, F2: true, F8: true },
  agentToolCallsMocked: false,
};

const phase2 = {
  flows: { F3: true, F4: true, F5: true },
  canaryHits: { modelInput: 0, logs: 0, bus: 0, storage: 0 },
  jobFinishedWithPcOff: true,
};

test("phase 0 passes when all four checks passed", () => {
  assert.deepEqual(checkPhaseExit(0, phase0), { ok: true, missing: [] });
});

test("phase 0 names an absent merge-pause check", () => {
  assert.deepEqual(checkPhaseExit(0, {
    npmTestPassed: true,
    smokeOpensApp: true,
    failingPrBlocked: true,
  }), { ok: false, missing: ["pauseFileStopsMerge"] });
});

test("phase 1 requires explicit confirmation that the final run used no mocks", () => {
  assert.deepEqual(checkPhaseExit(1, phase1), { ok: true, missing: [] });
  assert.deepEqual(checkPhaseExit(1, { ...phase1, agentToolCallsMocked: true }), {
    ok: false, missing: ["mocks-in-final-run"],
  });
  assert.deepEqual(checkPhaseExit(1, { flows: phase1.flows }), {
    ok: false, missing: ["mocks-in-final-run"],
  });
});

test("phase 1 names a failed flow", () => {
  assert.deepEqual(checkPhaseExit(1, { ...phase1, flows: { ...phase1.flows, F8: false } }), {
    ok: false, missing: ["F8"],
  });
});

test("phase 2 requires zero canary hits at every reported location", () => {
  assert.deepEqual(checkPhaseExit(2, phase2), { ok: true, missing: [] });
  assert.deepEqual(checkPhaseExit(2, { ...phase2, canaryHits: { ...phase2.canaryHits, logs: 1 } }), {
    ok: false, missing: ["canary-logs"],
  });
});

test("phase 2 names a location whose canary count is absent", () => {
  assert.deepEqual(checkPhaseExit(2, { ...phase2, canaryHits: { modelInput: 0, logs: 0, bus: 0 } }), {
    ok: false, missing: ["canary-storage-not-reported"],
  });
});

test("phase 2 requires the job to finish while the PC is off", () => {
  assert.deepEqual(checkPhaseExit(2, { flows: phase2.flows, canaryHits: phase2.canaryHits }), {
    ok: false, missing: ["jobFinishedWithPcOff"],
  });
});

test("phase 3 passes with both flows, the overlay fixture, and voice interrupt", () => {
  assert.deepEqual(checkPhaseExit(3, {
    flows: { F6: true, F7: true },
    overlaySameShapeOnTwoFamilies: true,
    voiceInterruptWorks: true,
  }), { ok: true, missing: [] });
});

test("unknown phases return the same verdict without coercion", () => {
  for (const phase of [7, -1, 1.5, NaN, "0", null, Symbol()]) {
    assert.deepEqual(checkPhaseExit(phase, phase0), { ok: false, missing: ["unknown-phase"] });
  }
});

test("null and malformed results fail closed in roadmap order", () => {
  const emptyPhase0 = {
    ok: false,
    missing: ["npmTestPassed", "smokeOpensApp", "failingPrBlocked", "pauseFileStopsMerge"],
  };
  const unreadable = new Proxy({}, {
    getOwnPropertyDescriptor() { throw new Error("unreadable"); },
  });
  for (const results of [null, undefined, "passed", [], Object.create(phase0), unreadable]) {
    assert.deepEqual(checkPhaseExit(0, results), emptyPhase0);
  }
  assert.deepEqual(checkPhaseExit(2, {
    flows: { F3: "true", F5: true },
    canaryHits: { modelInput: "0", logs: 1, bus: null },
    get jobFinishedWithPcOff() { throw new Error("unreadable"); },
  }), {
    ok: false,
    missing: ["F3", "F4", "canary-model-input-not-reported", "canary-logs",
      "canary-bus-not-reported", "canary-storage-not-reported", "jobFinishedWithPcOff"],
  });
});
