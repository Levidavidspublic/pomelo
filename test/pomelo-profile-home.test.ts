import assert from "node:assert/strict";
import test from "node:test";
import { checkProfileHome, type ProfileHomeInput } from "../src/pomelo/browser/profile-home.js";

const pc = { home: "pc", moveState: "settled", machine: "pc", liveOwner: null } as const;
const vps = { ...pc, home: "vps", machine: "vps" } as const;

test("a settled profile can open only on its home machine", () => {
  for (const input of [pc, vps]) {
    assert.deepEqual(checkProfileHome(input), {
      decision: "open", reason: "at-home", message: "This profile can open on this machine.",
    });
  }
  assert.deepEqual(checkProfileHome({ ...vps, machine: "pc" }), {
    decision: "refuse", reason: "wrong-home",
    message: "This profile lives on the VPS. Open it there or move it back.",
  });
  assert.deepEqual(checkProfileHome({ ...pc, machine: "vps" }), {
    decision: "refuse", reason: "wrong-home",
    message: "This profile lives on the PC. Open it there or move it to the VPS.",
  });
});

test("both machines wait while a profile is moving in either direction", () => {
  const waiting = {
    decision: "wait", reason: "move-in-progress", message: "This profile is moving. Wait for the move to finish.",
  };
  for (const input of [pc, vps]) {
    for (const moveState of ["moving-out", "moving-in"] as const) {
      for (const machine of ["pc", "vps"] as const) {
        const request = { ...input, moveState, machine };
        assert.deepEqual(checkProfileHome(request), waiting);
        assert.deepEqual(checkProfileHome({ ...request, liveOwner: machine }), waiting);
      }
    }
  }
});

test("a live lock or job on the other machine makes the request wait", () => {
  for (const input of [pc, vps]) {
    const other = input.machine === "pc" ? "vps" : "pc";
    for (const home of ["pc", "vps"] as const) {
      assert.deepEqual(checkProfileHome({ ...input, home, liveOwner: other }), {
        decision: "wait", reason: "held-elsewhere",
        message: "This profile is in use on another machine. Wait for it to close.",
      });
    }
  }
});

test("a live job on this machine can use its home profile", () => {
  for (const input of [pc, vps]) {
    assert.equal(checkProfileHome({ ...input, liveOwner: input.machine }).decision, "open");
    const other = input.machine === "pc" ? "vps" : "pc";
    assert.equal(checkProfileHome({ ...input, home: other, liveOwner: input.machine }).decision, "refuse");
  }
});

test("unknown or missing home and move state are refused", () => {
  for (const value of ["unknown", undefined]) {
    const invalidHome = { ...pc, home: value, moveState: "moving-out" } as ProfileHomeInput;
    const invalidState = { ...pc, moveState: value, liveOwner: "vps" } as ProfileHomeInput;
    assert.deepEqual(checkProfileHome(invalidHome), {
      decision: "refuse", reason: "unknown-home", message: "This profile's home is unknown.",
    });
    assert.deepEqual(checkProfileHome(invalidState), {
      decision: "refuse", reason: "unknown-move-state", message: "This profile's move status is unknown.",
    });
  }
});

test("an unrecognized requesting machine or live owner cannot open a profile", () => {
  const invalidMachine = { ...pc, machine: "unknown" } as unknown as ProfileHomeInput;
  const invalidOwner = { ...pc, liveOwner: "unknown" } as unknown as ProfileHomeInput;
  assert.equal(checkProfileHome(invalidMachine).decision, "refuse");
  assert.equal(checkProfileHome(invalidOwner).decision, "refuse");
});

test("results never echo a profile path, host, address, or key reference", () => {
  const details = {
    profilePath: "/fixture/browser-profile",
    host: "browser.example.test",
    address: "192.0.2.42",
    keyRef: "fixture-reference",
  };
  const inputs: ProfileHomeInput[] = [pc, { ...vps, machine: "pc" }, { ...pc, liveOwner: "vps" }];
  for (const input of inputs) {
    const withDetails = { ...input, ...details };
    const result = checkProfileHome(withDetails);
    assert.deepEqual(result, checkProfileHome(input));
    const resultText = JSON.stringify(result);
    for (const value of Object.values(details)) {
      assert.ok(!resultText.includes(value));
    }
  }
  assert.deepEqual(checkProfileHome({ ...pc, home: details.profilePath } as ProfileHomeInput), {
    decision: "refuse", reason: "unknown-home", message: "This profile's home is unknown.",
  });
  assert.deepEqual(checkProfileHome({ ...pc, moveState: details.address } as ProfileHomeInput), {
    decision: "refuse", reason: "unknown-move-state", message: "This profile's move status is unknown.",
  });
});
