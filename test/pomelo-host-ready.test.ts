import assert from "node:assert/strict";
import test from "node:test";
import { hostReady } from "../src/pomelo/host-ready.js";

function checked(name: string, action = "go", ...reasons: string[]) {
  return { name, action, reasons };
}

test("returns go when all required checks ran and starts the summary with the verdict", () => {
  const disk = checked("disk", "go", "Enough free space.");
  const memory = checked("memory");
  const verdict = hostReady(Object.freeze(["disk", "memory"]), Object.freeze([disk, memory]));

  assert.equal(verdict.action, "go");
  assert.match(verdict.summary, /^go\b.*2 of 2 required checks ran/);
  assert.deepEqual(verdict.missing, []);
  assert.deepEqual(verdict.byCheck, [disk, memory]);
});

test("stops when the required check list is empty", () => {
  for (const results of [[], [checked("disk")]]) {
    const verdict = hostReady([], results);

    assert.equal(verdict.action, "stop");
    assert.match(verdict.summary, /^stop\b.*0 of 0 required checks ran.*No required checks/);
  }
});

test("maps the host checks' action words to the three readiness levels", () => {
  for (const action of ["clean-up", "clean", "cleanup", "wait", "fewer", "reinstall"]) {
    const result = checked("host", action);
    const verdict = hostReady(["host"], [result]);

    assert.equal(verdict.action, "clean-up", action);
    assert.deepEqual(verdict.byCheck, [result]);
  }
  assert.equal(hostReady(["node"], [checked("node", "ok")]).action, "go");
  for (const action of ["stop", "too-old", "unreadable"]) {
    assert.equal(hostReady(["node"], [checked("node", action)]).action, "stop", action);
  }
});

test("one clean-up action takes precedence over passing checks", () => {
  const verdict = hostReady(["disk", "memory", "clock"], [
    checked("disk"), checked("memory", "clean-up"), checked("clock"),
  ]);

  assert.equal(verdict.action, "clean-up");
  assert.match(verdict.summary, /^clean-up\b.*3 of 3 required checks ran/);
});

test("stop wins over clean-up and a passing extra result", () => {
  const disk = checked("disk", "stop", "Disk is full.");
  const memory = checked("memory", "fewer", "Reduce workers.");
  const clock = checked("clock");
  const verdict = hostReady(["disk", "memory"], [disk, memory, clock]);

  assert.equal(verdict.action, "stop");
  assert.match(verdict.summary, /^stop\b.*2 of 2 required checks ran/);
  assert.deepEqual(verdict.byCheck, [disk, memory, clock]);
});

test("an extra check can report a stop", () => {
  const disk = checked("disk");
  const ports = checked("ports", "stop", "A required port is occupied.");
  const verdict = hostReady(["disk"], [disk, ports]);

  assert.equal(verdict.action, "stop");
  assert.deepEqual(verdict.byCheck, [disk, ports]);
});

test("stops and lists required checks with no result", () => {
  const verdict = hostReady(["disk", "ports", "clock"], [checked("disk"), checked("memory")]);

  assert.equal(verdict.action, "stop");
  assert.deepEqual(verdict.missing, ["ports", "clock"]);
  assert.match(verdict.summary, /^stop\b.*1 of 3 required checks ran/);
});

test("conflicting reported actions stop the run even when both map to clean-up", () => {
  for (const [first, second] of [["go", "wait"], ["wait", "fewer"]]) {
    const verdict = hostReady(["clock"], [
      checked("clock", first, "First reason."), checked("clock", second, "Second reason."),
    ]);

    assert.equal(verdict.action, "stop");
    assert.match(verdict.summary, /^stop\b.*1 of 1 required checks ran/);
    assert.equal(verdict.byCheck.length, 1);
    assert.equal(verdict.byCheck[0].name, "clock");
    assert.equal(verdict.byCheck[0].action, "stop");
    assert.deepEqual(verdict.byCheck[0].reasons.slice(0, 2), ["First reason.", "Second reason."]);
    assert.match(verdict.byCheck[0].reasons.join(" "), /conflict/i);
  }
});

test("groups reasons when repeated results agree on the action", () => {
  const verdict = hostReady(["disk"], [
    checked("disk", "go", "First volume is ready."), checked("disk", "go", "Second volume is ready."),
  ]);

  assert.equal(verdict.action, "go");
  assert.match(verdict.summary, /^go\b.*1 of 1 required checks ran/);
  assert.deepEqual(verdict.byCheck, [checked("disk", "go", "First volume is ready.", "Second volume is ready.")]);
});

test("unrecognized actions stop the run", () => {
  for (const action of ["ready", "constructor", "__proto__"]) {
    const verdict = hostReady(["disk"], [checked("disk", action, "Unexpected status.")]);

    assert.equal(verdict.action, "stop", action);
    assert.deepEqual(verdict.missing, []);
    assert.match(verdict.byCheck[0].reasons.join(" "), /unknown.*action/i);
  }
});

test("non-array and malformed inputs stop the run", () => {
  for (const required of [null, "disk", {}, ["disk", 3], [" "], new Array(1)]) {
    assert.equal(hostReady(required, [checked("disk")]).action, "stop");
  }
  const malformedResults = [
    null, "go", {}, new Array(1), [null],
    [{ name: "disk", reasons: [] }],
    [{ name: "disk", action: "go", reasons: [false] }],
    [{ name: "disk", action: "go", reasons: new Array(1) }],
    [checked("disk"), { name: "ports", action: "go", reasons: "malformed" }],
  ];
  for (const results of malformedResults) {
    assert.equal(hostReady(["disk"], results).action, "stop");
  }
  const malformed = hostReady(["disk"], [{ name: "disk", action: "go" }]);
  assert.deepEqual(malformed.missing, ["disk"]);
  assert.match(malformed.summary, /^stop\b.*0 of 1 required checks ran/);
});

test("removes control characters and bounds reason text without changing the input", () => {
  const reason = "Low\u0000 \u001bspace\nnow\u0085." + "x".repeat(300);
  const disk = Object.freeze({ name: "disk", action: "stop", reasons: Object.freeze([reason]) });
  const verdict = hostReady(["disk"], [disk]);
  const [reported] = verdict.byCheck[0].reasons;

  assert.ok(reported.startsWith("Low spacenow."));
  assert.ok(reported.length <= 200);
  assert.doesNotMatch(reported, /\p{Cc}/u);
  assert.deepEqual(disk.reasons, [reason]);
});

test("bounds each check's reasons across repeated results and keeps the conflict explanation", () => {
  const firstReasons = Array.from({ length: 6 }, (_, index) => `First result, reason ${index + 1}.`);
  const nextReasons = Array.from({ length: 100 }, (_, index) => `Second result, reason ${index + 1}.`);
  const verdict = hostReady(["disk"], [
    checked("disk", "go", ...firstReasons),
    checked("disk", "stop", ...nextReasons),
  ]);

  assert.equal(verdict.action, "stop");
  assert.deepEqual(verdict.byCheck[0].reasons, [
    ...firstReasons, ...nextReasons.slice(0, 3), "Conflicting check actions.",
  ]);
});

test("rejects malformed reasons beyond the reporting limit", () => {
  const reasons = [...Array<string>(100).fill("Valid reason."), false];
  const verdict = hostReady(["disk"], [{ name: "disk", action: "go", reasons }]);

  assert.equal(verdict.action, "stop");
  assert.deepEqual(verdict.missing, ["disk"]);
});

test("cleans and bounds names in the report while matching the original names", () => {
  const name = "d\u0000i\u001bs\nk\u2028-" + "x".repeat(300);
  const displayName = "disk-" + "x".repeat(95);
  const matching = hostReady([name], [checked(name)]);
  const different = hostReady([name], [checked(displayName)]);

  assert.equal(matching.action, "go");
  assert.deepEqual(matching.byCheck, [checked(displayName)]);
  assert.equal(different.action, "stop");
  assert.deepEqual(different.missing, [displayName]);
  assert.match(different.summary, /^stop\b.*0 of 1 required checks ran/);
});
