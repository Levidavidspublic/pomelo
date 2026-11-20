import assert from "node:assert/strict";
import test from "node:test";
import { memHeadroom } from "../src/pomelo/mem-headroom.js";

const plenty = `               total        used        free      shared  buff/cache   available
Mem:         8388608     1048576     1048576           0     6291456     5242880
Swap:        2097152           0     2097152
`;
const opts = { workersWanted: 3, perWorkerKb: 1048576, stopFloorKb: 524288 };

test("enough available memory lets every requested worker start", () => {
  const result = memHeadroom(plenty, opts);
  assert.equal(result.verdict, "go");
  assert.equal(result.workersThatFit, 3);
  assert.equal(result.availableKb, 5242880);
  assert.ok(result.reason);
  assert.equal(memHeadroom(plenty).workersThatFit, 1);
});

test("available memory limits workers to the whole number that fits", () => {
  const result = memHeadroom(plenty.replace("5242880", "2621440"), opts);
  assert.equal(result.verdict, "fewer");
  assert.equal(result.workersThatFit, 2);
  assert.equal(result.availableKb, 2621440);
});

test("memory below the stop floor stops the run even if a worker would fit", () => {
  const result = memHeadroom(plenty.replace("5242880", "262144"), { ...opts, perWorkerKb: 131072 });
  assert.equal(result.verdict, "stop");
  assert.equal(result.workersThatFit, 0);
  assert.equal(result.availableKb, 262144);
});

test("the run stops when there is too little memory for one worker", () => {
  const result = memHeadroom(plenty.replace("5242880", "524288"), opts);
  assert.equal(result.verdict, "stop");
  assert.equal(result.workersThatFit, 0);
});

test("swap above half full reduces the worker count even with ample memory", () => {
  const halfFull = plenty.replace("Swap:        2097152           0     2097152", "Swap:        2097152     1048576     1048576");
  const overHalf = halfFull.replace("1048576     1048576\n", "1048577     1048575\n");
  assert.equal(memHeadroom(halfFull, opts).verdict, "go");
  const result = memHeadroom(overHalf, opts);
  assert.equal(result.verdict, "fewer");
  assert.equal(result.workersThatFit, 2);
  const singleWorker = memHeadroom(overHalf, { ...opts, workersWanted: 1 });
  assert.equal(singleWorker.verdict, "stop");
  assert.equal(singleWorker.workersThatFit, 0);
});

test("older free output adds free memory and the buffer and cache columns", () => {
  const combined = `         total    used    free  shared  buff/cache
Mem:                   8388608 4194304 1048576       0     3145728
Swap:                        0       0       0
`;
  const separate = `         total    used    free  shared  buffers   cached
Mem:                   8388608 7340032 1048576       0   524288  2621440
-/+ buffers/cache:             4194304 4194304
Swap:                        0       0       0
`;
  for (const sample of [combined, separate]) {
    const result = memHeadroom(sample, opts);
    assert.equal(result.verdict, "go");
    assert.equal(result.availableKb, 4194304);
  }
});

test("unreadable memory or swap values stop the run", () => {
  const unreadable = [
    "",
    plenty.replace(/^Mem:.*\n/m, ""),
    plenty.replace("5242880", "unknown"),
    plenty.replace("5242880", ""),
    plenty.replace("5242880", "5242880abc"),
    plenty.replace("     6291456", "     -6291456"),
    plenty.replace("Swap:        2097152           0", "Swap:        2097152     unknown"),
  ];
  for (const sample of unreadable) {
    assert.deepEqual(memHeadroom(sample, opts), {
      verdict: "stop",
      workersThatFit: 0,
      availableKb: null,
      reason: "unreadable",
    });
  }
});

test("invalid option values stop the run", () => {
  for (const invalid of [{ perWorkerKb: 0 }, { stopFloorKb: NaN }, { workersWanted: 1.5 }]) {
    const result = memHeadroom(plenty, { ...opts, ...invalid });
    assert.equal(result.verdict, "stop");
    assert.equal(result.workersThatFit, 0);
    assert.equal(result.availableKb, 5242880);
  }
});
