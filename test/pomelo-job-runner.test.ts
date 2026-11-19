import assert from "node:assert/strict";
import test from "node:test";
import { pickRunner } from "../src/pomelo/browser/job-runner.js";

const cloud = { id: "cloud-profile", location: "cloud" } as const;
const local = { id: "local-profile", location: "local" } as const;
const cloudJob = { profileId: cloud.id, state: "queued" };
const localJob = { profileId: local.id, state: "queued" };
const desktop = { id: "pc", where: "desktop", online: true } as const;
const vps = { id: "vps-b", where: "vps", online: true, cdpReachable: true } as const;

test("a cloud job picks the reachable VPS while the PC is off", () => {
  assert.deepEqual(pickRunner(cloudJob, cloud, [{ ...desktop, online: false }, vps]), { run: vps.id });
});

test("a cloud job holds when the VPS is offline even with the PC online", () => {
  assert.deepEqual(pickRunner(cloudJob, cloud, [{ ...vps, online: false }, desktop]), { hold: "vps-unreachable" });
});

test("a cloud job requires an explicit reachable CDP status", () => {
  for (const worker of [{ ...vps, cdpReachable: false }, { id: vps.id, where: vps.where, online: true }]) {
    assert.deepEqual(pickRunner(cloudJob, cloud, [worker]), { hold: "vps-unreachable" });
  }
});

test("a local job picks the online desktop without requiring CDP", () => {
  assert.deepEqual(pickRunner(localJob, local, [{ ...vps, id: "a-vps" }, desktop]), { run: desktop.id });
});

test("a local job holds when the PC is offline even with a reachable VPS", () => {
  assert.deepEqual(pickRunner(localJob, local, [{ ...desktop, online: false }, vps]), { hold: "pc-offline" });
});

test("a job holds when its profile id differs from the supplied profile", () => {
  assert.deepEqual(pickRunner(cloudJob, local, [desktop, vps]), { hold: "profile-mismatch" });
});

test("a running job holds even when its worker is available", () => {
  assert.deepEqual(pickRunner({ ...cloudJob, state: "running" }, cloud, [vps]), { hold: "not-queued" });
});

test("the lowest eligible worker id wins regardless of input order", () => {
  const lowerVps = { ...vps, id: "vps-a" };
  const unreachableVps = { ...vps, id: "vps-0", cdpReachable: false };
  const workers = Object.freeze([vps, lowerVps, unreachableVps]);
  assert.deepEqual(pickRunner(cloudJob, cloud, workers), { run: lowerVps.id });
  assert.deepEqual(pickRunner(cloudJob, cloud, [...workers].reverse()), { run: lowerVps.id });
});

test("an empty worker list holds with the reason for the profile location", () => {
  assert.deepEqual(pickRunner(cloudJob, cloud, []), { hold: "vps-unreachable" });
  assert.deepEqual(pickRunner(localJob, local, []), { hold: "pc-offline" });
});

test("malformed runtime inputs hold without throwing", () => {
  const pickFromRuntime = (...args: unknown[]) => pickRunner(...args as Parameters<typeof pickRunner>);
  assert.deepEqual(pickFromRuntime(null, cloud, [vps]), { hold: "profile-mismatch" });
  assert.deepEqual(pickFromRuntime(cloudJob, undefined, [vps]), { hold: "profile-mismatch" });
  assert.deepEqual(pickFromRuntime(cloudJob, { ...cloud, location: "other" }, [vps]), { hold: "profile-mismatch" });
  assert.deepEqual(pickFromRuntime({ profileId: cloud.id }, cloud, [vps]), { hold: "not-queued" });
  assert.deepEqual(pickFromRuntime(cloudJob, cloud, {}), { hold: "vps-unreachable" });
  assert.deepEqual(pickFromRuntime(cloudJob, cloud, [
    null, { ...vps, id: 1 }, { ...vps, online: "yes" }, { ...vps, cdpReachable: 1 },
  ]), { hold: "vps-unreachable" });
});
