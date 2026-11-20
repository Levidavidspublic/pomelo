import assert from "node:assert/strict";
import test from "node:test";
import { checkPcOff, type PcOffFacts } from "../src/pomelo/browser/pc-off.js";

const cloudJob: PcOffFacts = Object.freeze({
  profileHome: "vps",
  worker: "vps",
  needsFill: false,
  importsPcChrome: false,
  hasPcUpload: false,
});

test("a VPS job without PC dependencies can finish with the PC off", () => {
  assert.deepEqual(checkPcOff(cloudJob), { verdict: "can-finish", reasons: [] });
});

test("a PC profile needs the PC", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, profileHome: "pc" }), {
    verdict: "needs-pc",
    reasons: ["profile lives on the PC"],
  });
});

test("a PC worker needs the PC", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, worker: "pc" }), {
    verdict: "needs-pc",
    reasons: ["worker runs on the PC"],
  });
});

test("a 1Password fill can finish when the vault is reachable from the VPS", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, needsFill: true, vaultAccess: "vps" }), {
    verdict: "can-finish",
    reasons: [],
  });
});

test("a 1Password fill needs the PC when the vault is only reachable there", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, needsFill: true, vaultAccess: "pc" }), {
    verdict: "needs-pc",
    reasons: ["fill needs 1Password on the PC"],
  });
});

test("a locked 1Password vault holds a job that needs a fill", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, needsFill: true, vaultAccess: "LOCKED" }), {
    verdict: "hold-for-amit",
    reasons: ["1Password vault is locked"],
  });
  assert.deepEqual(checkPcOff({ ...cloudJob, vaultAccess: "LOCKED" }), {
    verdict: "can-finish",
    reasons: [],
  });
});

test("an import from PC Chrome needs the PC", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, importsPcChrome: true }), {
    verdict: "needs-pc",
    reasons: ["import needs Chrome on the PC"],
  });
});

test("an upload from a PC folder needs the PC", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, hasPcUpload: true }), {
    verdict: "needs-pc",
    reasons: ["upload needs a folder on the PC"],
  });
});

test("all PC dependencies are listed in a steady order", () => {
  assert.deepEqual(checkPcOff({
    hasPcUpload: true,
    importsPcChrome: true,
    vaultAccess: "pc",
    needsFill: true,
    worker: "pc",
    profileHome: "pc",
  }), {
    verdict: "needs-pc",
    reasons: [
      "profile lives on the PC",
      "worker runs on the PC",
      "fill needs 1Password on the PC",
      "import needs Chrome on the PC",
      "upload needs a folder on the PC",
    ],
  });
});

test("each missing or invalid fact needed for the decision is named", () => {
  const facts: PcOffFacts = { ...cloudJob, needsFill: true, vaultAccess: "vps" };
  const cases = [
    ["profileHome", "cloud", "profile location is unknown"],
    ["worker", "cloud", "worker location is unknown"],
    ["needsFill", "true", "whether the job needs a 1Password fill is unknown"],
    ["vaultAccess", false, "1Password vault access is unknown"],
    ["importsPcChrome", 0, "whether the job imports from PC Chrome is unknown"],
    ["hasPcUpload", null, "whether an upload needs a PC folder is unknown"],
  ] as const;
  for (const [field, invalid, reason] of cases) {
    const missing: Partial<PcOffFacts> = { ...facts };
    delete missing[field];
    const held = { verdict: "hold-for-amit", reasons: [reason] };
    assert.deepEqual(checkPcOff(missing), held);
    assert.deepEqual(checkPcOff({ ...facts, [field]: invalid }), held);
  }
});

test("a hold takes precedence and still lists known PC dependencies", () => {
  assert.deepEqual(checkPcOff({ ...cloudJob, profileHome: "pc", needsFill: true, hasPcUpload: true }), {
    verdict: "hold-for-amit",
    reasons: ["profile lives on the PC", "1Password vault access is unknown", "upload needs a folder on the PC"],
  });
});

test("absent input and unreadable facts produce a hold without throwing", () => {
  assert.equal(checkPcOff(null).verdict, "hold-for-amit");
  assert.equal(checkPcOff(undefined).verdict, "hold-for-amit");
  let getterCalled = false;
  const facts = {
    ...cloudJob,
    get worker() {
      getterCalled = true;
      throw new Error("fixture getter");
    },
  };
  assert.deepEqual(checkPcOff(facts), { verdict: "hold-for-amit", reasons: ["worker location is unknown"] });
  assert.equal(getterCalled, false);
});

test("reasons never repeat an address, path, vault reference, or secret from the input", () => {
  const canary = "pc-off-fixture-canary";
  const address = `https://${canary}.example.invalid`;
  const path = `/fixture/${canary}/upload.txt`;
  const ref = `op://fixture/${canary}/field`;
  const result = checkPcOff({
    ...cloudJob,
    profileHome: path,
    worker: address,
    needsFill: true,
    vaultAccess: ref,
    hasPcUpload: canary,
  });
  assert.equal(result.verdict, "hold-for-amit");
  for (const detail of [canary, address, path, ref, "op://"]) {
    assert.equal(result.reasons.some((reason) => reason.includes(detail)), false);
  }
});
