import assert from "node:assert/strict";
import test from "node:test";
import { workerHang, type WorkerHangInput } from "../src/pomelo/worker-hang.js";

const minute = 60_000;
const startedAt = 1_000_000;
const snapshot: WorkerHangInput = {
  command: "npm test -- test/example.test.ts",
  startedAt,
  lastOutputAt: startedAt,
  now: startedAt,
};

test("recent output lets a test go on and reports both elapsed times", () => {
  const result = workerHang({ ...snapshot, lastOutputAt: startedAt + 6 * minute, now: startedAt + 7 * minute });
  assert.equal(result.verdict, "go-on");
  assert.equal(result.quietMs, minute);
  assert.equal(result.runMs, 7 * minute);
});

test("a test warns after three quiet minutes and stops after eight", () => {
  assert.equal(workerHang({ ...snapshot, now: startedAt + 3 * minute }).verdict, "go-on");
  const warning = workerHang({ ...snapshot, now: startedAt + 3 * minute + 1 });
  assert.equal(warning.verdict, "warn");
  assert.match(warning.reason, /no output.*test/i);

  assert.equal(workerHang({ ...snapshot, now: startedAt + 8 * minute }).verdict, "warn");
  const stop = workerHang({ ...snapshot, now: startedAt + 8 * minute + 1 });
  assert.equal(stop.verdict, "stop");
  assert.match(stop.reason, /no output.*test/i);
});

test("fresh output does not prevent a stop after ten minutes of total runtime", () => {
  const lastOutputAt = startedAt + 10 * minute;
  assert.equal(workerHang({ ...snapshot, lastOutputAt, now: lastOutputAt }).verdict, "go-on");
  const result = workerHang({ ...snapshot, lastOutputAt, now: lastOutputAt + 1 });
  assert.equal(result.verdict, "stop");
  assert.match(result.reason, /has run/i);
  assert.equal(result.quietMs, 1);
  assert.equal(result.runMs, 10 * minute + 1);
});

test("when both stop limits have passed, the reason names the first one crossed", () => {
  const now = startedAt + 11 * minute;
  assert.match(workerHang({ ...snapshot, now }).reason, /no output/i);
  assert.match(workerHang({ ...snapshot, now, lastOutputAt: startedAt + 2.5 * minute }).reason, /has run/i);
});

test("npm ci and npm install get more quiet time with the same total limit", () => {
  for (const command of ["npm ci", "npm install"]) {
    assert.equal(workerHang({ ...snapshot, command, now: startedAt + 4 * minute }).verdict, "go-on");
    const warning = workerHang({ ...snapshot, command, now: startedAt + 8.5 * minute });
    assert.equal(warning.verdict, "warn");
    assert.match(warning.reason, /no output.*install/i);
    assert.equal(workerHang({ ...snapshot, command, now: startedAt + 9.5 * minute }).verdict, "stop");

    const now = startedAt + 10 * minute + 1;
    assert.equal(workerHang({ ...snapshot, command, now, lastOutputAt: now }).verdict, "stop");
  }
});

test("the command kind comes from the invocation, rather than unrelated arguments", () => {
  const now = startedAt + 4 * minute;
  assert.match(workerHang({ ...snapshot, command: "npm run typecheck", now }).reason, /typecheck command/i);
  assert.match(workerHang({ ...snapshot, command: "node scripts/test.mjs", now }).reason, /test command/i);
  const other = workerHang({ ...snapshot, command: "echo npm ci", now });
  assert.equal(other.verdict, "warn");
  assert.doesNotMatch(other.reason, /install/i);
});

test("custom limits apply to an install and can be supplied individually", () => {
  const install = { ...snapshot, command: "npm ci", limits: { warnQuietMs: 50, stopQuietMs: 100, maxRunMs: 200 } };
  assert.equal(workerHang({ ...install, now: startedAt + 51 }).verdict, "warn");
  assert.equal(workerHang({ ...install, now: startedAt + 101 }).verdict, "stop");
  const now = startedAt + 201;
  assert.match(workerHang({ ...install, lastOutputAt: now, now }).reason, /has run/i);

  const partial = workerHang({ ...snapshot, limits: { warnQuietMs: 50 }, now: startedAt + 51 });
  assert.equal(partial.verdict, "warn");
});

test("invalid timestamps or a blank command stop with a plain reason", () => {
  for (const field of ["startedAt", "lastOutputAt", "now"] as const) {
    for (const value of [NaN, Infinity, -Infinity, "1000000"]) {
      const result = workerHang({ ...snapshot, [field]: value } as WorkerHangInput);
      assert.equal(result.verdict, "stop");
      assert.match(result.reason, /finite/i);
    }
  }
  for (const input of [
    { ...snapshot, lastOutputAt: startedAt - 1 },
    { ...snapshot, now: startedAt - 1 },
    { ...snapshot, lastOutputAt: startedAt + 1 },
  ]) {
    const result = workerHang(input);
    assert.equal(result.verdict, "stop");
    assert.match(result.reason, /start|output/i);
  }
  for (const command of ["", " \t\n "]) {
    const result = workerHang({ ...snapshot, command });
    assert.equal(result.verdict, "stop");
    assert.match(result.reason, /command.*empty/i);
  }
});

test("reasons never echo command-line arguments", () => {
  const fakeValue = "fixture_only_7xb4q";
  for (const command of [`npm test -- --token=${fakeValue}`, `echo ${fakeValue}`]) {
    for (const elapsed of [0, 4 * minute, 9 * minute, 11 * minute]) {
      const result = workerHang({ ...snapshot, command, now: startedAt + elapsed });
      assert.ok(!result.reason.includes(command));
      assert.ok(!result.reason.includes(fakeValue));
    }
  }
});
