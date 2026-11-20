import assert from "node:assert/strict";
import test from "node:test";
import { cpuLoad } from "../src/pomelo/cpu-load.js";

const quiet = "0.50 0.25 0.70 2/345 12345";

test("a quiet four-core machine fits all requested workers", () => {
  const result = cpuLoad(quiet, "4", { workersWanted: 3 });
  assert.equal(result.verdict, "go");
  assert.equal(result.workersThatFit, 3);
  assert.deepEqual(result.loadPerCore, { oneMinute: 0.125, fiveMinute: 0.0625 });
  assert.ok(result.reason);
  assert.equal(cpuLoad(quiet, "4").workersThatFit, 1);
});

test("a half-busy machine fits only the whole workers that have free capacity", () => {
  const result = cpuLoad("1.50 2.00 0.70 2/345 12345", "4", { workersWanted: 4 });
  assert.equal(result.verdict, "fewer");
  assert.equal(result.workersThatFit, 2);
  assert.deepEqual(result.loadPerCore, { oneMinute: 0.375, fiveMinute: 0.5 });
  assert.equal(cpuLoad("2.25 2.00 0.70 2/345 12345", "4", { workersWanted: 4 }).workersThatFit, 1);
});

test("load above the stop limit on both averages stops the run", () => {
  const result = cpuLoad("9.00 10.00 0.70 2/345 12345", "4");
  assert.equal(result.verdict, "stop");
  assert.equal(result.workersThatFit, 0);
  assert.deepEqual(result.loadPerCore, { oneMinute: 2.25, fiveMinute: 2.5 });
});

test("a rising one-minute load never admits more workers with a calm five-minute load", () => {
  for (const [oneMinute, workersThatFit] of [[0.5, 3], [2.25, 1], [6, 1], [8, 1], [9, 1]]) {
    const result = cpuLoad(`${oneMinute} 0.25 0.70 2/345 12345`, "4", { workersWanted: 4 });
    assert.equal(result.verdict, "fewer", `one-minute load ${oneMinute}`);
    assert.equal(result.workersThatFit, workersThatFit, `one-minute load ${oneMinute}`);
    assert.deepEqual(result.loadPerCore, { oneMinute: oneMinute / 4, fiveMinute: 0.0625 });
  }
});

test("a reading equal to the stop limit can still admit workers", () => {
  const result = cpuLoad("2.00 2.50 0.70 2/345 12345", "4", { workersWanted: 4, stopAbovePerCore: 0.5 });
  assert.equal(result.verdict, "fewer");
  assert.equal(result.workersThatFit, 1);
});

test("the run stops when there is too little CPU capacity for one worker", () => {
  for (const loadavgText of ["7.90 7.90 0.70 2/345 12345", "9.00 8.00 0.70 2/345 12345", "9.00 3.01 0.70 2/345 12345"]) {
    const result = cpuLoad(loadavgText, "4");
    assert.equal(result.verdict, "stop");
    assert.equal(result.workersThatFit, 0);
    assert.match(result.reason, /too low for one worker/);
  }
});

test("an idle single core fits one worker", () => {
  const result = cpuLoad("0.00 0.00 0.70 2/345 12345", "1", { workersWanted: 2 });
  assert.equal(result.verdict, "fewer");
  assert.equal(result.workersThatFit, 1);
});

test("LF and CRLF endings are accepted in both readings", () => {
  for (const ending of ["\n", "\r\n"]) {
    assert.deepEqual(cpuLoad(quiet + ending, "4" + ending), cpuLoad(quiet, "4"));
  }
});

test("unreadable load or core counts stop the run", () => {
  const unreadable = [
    ["", "4"],
    ["0.50 0.25 0.70 2/345", "4"],
    ["NaN 0.25 0.70 2/345 12345", "4"],
    ["0.50 -0.25 0.70 2/345 12345", "4"],
    ["0.50 0.25 NaN 2/345 12345", "4"],
    ["0.50 0.25 0.70 2/ 12345", "4"],
    ["0.50 0.25 0.70 2/345 abc", "4"],
    [quiet, ""],
    [quiet, "0"],
    [quiet, "abc"],
    [quiet, "-4"],
    [quiet, "2.5"],
  ];
  for (const [loadavgText, nprocText] of unreadable) {
    assert.deepEqual(cpuLoad(loadavgText, nprocText), {
      verdict: "stop",
      workersThatFit: 0,
      loadPerCore: null,
      reason: "unreadable",
    });
  }
});

test("requesting zero workers gives go with zero workers", () => {
  const result = cpuLoad(quiet, "4", { workersWanted: 0 });
  assert.equal(result.verdict, "go");
  assert.equal(result.workersThatFit, 0);
});

test("options override the per-worker capacity and stop limit", () => {
  const result = cpuLoad(quiet, "4", { workersWanted: 3, perWorkerCores: 2 });
  assert.equal(result.verdict, "fewer");
  assert.equal(result.workersThatFit, 1);
  assert.equal(cpuLoad(quiet, "4", { stopAbovePerCore: 0.05 }).verdict, "stop");
});

test("invalid options stop the run without admitting workers", () => {
  for (const options of [{ workersWanted: 1.5 }, { perWorkerCores: 0 }, { stopAbovePerCore: NaN }]) {
    const result = cpuLoad(quiet, "4", options);
    assert.equal(result.verdict, "stop");
    assert.equal(result.workersThatFit, 0);
  }
});
