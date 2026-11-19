import assert from "node:assert/strict";
import test from "node:test";
import {
  appendStep, createJob, getJob, getProfile, listJobs, listProfiles, moveJob, saveProfile, startJob,
  type BrowserProfile,
} from "../src/pomelo/browser-records.js";
import type { PomeloStore } from "../src/pomelo/store.js";
import { HIDDEN } from "../src/secrets.js";

function rig() {
  const records = new Map<string, string>();
  const audit: { key: string; entry: unknown }[] = [];
  const store: PomeloStore = {
    async get<T>(key: string) {
      const json = records.get(key);
      return json === undefined ? null : JSON.parse(json) as T;
    },
    async set(key, value, condition) {
      if (condition === "ifMissing" && records.has(key)) return false;
      records.set(key, JSON.stringify(value));
      return true;
    },
    async list<T>(prefix: string) {
      return [...records.keys()].sort().filter((key) => key.startsWith(prefix)).map((key) => ({
        key, value: JSON.parse(records.get(key)!) as T,
      }));
    },
    async appendLog(key, entry) {
      audit.push({ key, entry });
    },
  };
  return { store, records, audit };
}

const profile: BrowserProfile = {
  id: "local-profile", name: "Local browser", location: "local", cdpUrlName: "POMELO_CDP_URL",
  importedFrom: "Sample profile", encryptedAtRest: true,
};

function queue(store: PomeloStore, id: string, profileId = profile.id) {
  return createJob(store, { id, threadId: "thread", laneId: "lane", profileId });
}

test("browser profiles round-trip by id and only accept an environment name for CDP", async () => {
  const { store, records } = rig();
  await saveProfile(store, profile);
  const cloud: BrowserProfile = {
    id: "cloud-profile", name: "Cloud browser", location: "cloud", cdpUrlName: "CLOUD_CDP_URL", encryptedAtRest: true,
  };
  await saveProfile(store, cloud);

  await assert.rejects(saveProfile(store, { ...profile, cdpUrlName: "ws://example.invalid" }), /environment variable name/);
  await assert.rejects(saveProfile(store, { ...profile, cdpUrlName: "CDP URL" }), /environment variable name/);
  assert.deepEqual(await getProfile(store, profile.id), profile);
  assert.deepEqual(await listProfiles(store), [cloud, profile]);
  assert.equal(await getProfile(store, "missing"), null);
  assert.deepEqual(JSON.parse(records.get(`profile:${profile.id}`)!), profile);
});

test("browser jobs begin queued and duplicate creation preserves the original record", async () => {
  const { store, records } = rig();
  await saveProfile(store, profile);
  const expected = {
    id: "job", threadId: "thread", laneId: "lane", profileId: profile.id,
    state: "queued", steps: [], resourceLock: null,
  };
  assert.deepEqual(await queue(store, "job"), expected);
  await assert.rejects(createJob(store, { ...expected, laneId: "other-lane" }), /already exists/);
  await assert.rejects(queue(store, "job:events"), /cannot end with :events/);
  assert.deepEqual(await getJob(store, "job"), expected);
  assert.deepEqual(await listJobs(store), [expected]);
  assert.equal(await getJob(store, "missing"), null);
  assert.deepEqual(JSON.parse(records.get("job:job")!), expected);
});

test("legal browser job moves are audited in order and illegal moves preserve state", async () => {
  const { store, audit } = rig();
  await saveProfile(store, profile);
  await queue(store, "job");

  await assert.rejects(moveJob(store, "job", "done"), /queued to done/);
  assert.equal((await getJob(store, "job"))?.state, "queued");
  assert.deepEqual(audit, []);
  assert.deepEqual(await startJob(store, "job"), { ok: true });
  assert.equal((await getJob(store, "job"))?.resourceLock, profile.id);
  await moveJob(store, "job", "waiting");
  assert.equal((await getJob(store, "job"))?.resourceLock, profile.id);
  await assert.rejects(moveJob(store, "job", "done"), /waiting to done/);
  assert.equal((await getJob(store, "job"))?.state, "waiting");
  await startJob(store, "job");
  await moveJob(store, "job", "done");
  await assert.rejects(startJob(store, "job"), /done to running/);
  assert.equal((await getJob(store, "job"))?.state, "done");
  assert.deepEqual(audit, [
    { key: "job:job", entry: { from: "queued", to: "running" } },
    { key: "job:job", entry: { from: "running", to: "waiting" } },
    { key: "job:job", entry: { from: "waiting", to: "running" } },
    { key: "job:job", entry: { from: "running", to: "done" } },
  ]);
});

for (const terminal of ["done", "failed", "cancelled"] as const) {
  test(`a browser profile lock is released on ${terminal}`, async () => {
    const { store } = rig();
    await saveProfile(store, profile);
    await queue(store, "first");
    await queue(store, "second");

    await startJob(store, "first");
    assert.deepEqual(await startJob(store, "second"), { ok: false, heldBy: "first" });
    if (terminal !== "done") {
      await moveJob(store, "first", "waiting");
      assert.deepEqual(await moveJob(store, "second", "running"), { ok: false, heldBy: "first" });
    }
    await moveJob(store, "first", terminal);
    const finished = await getJob(store, "first");
    assert.equal(finished?.state, terminal);
    assert.equal(finished?.resourceLock, null);
    assert.equal((await getJob(store, "second"))?.state, "queued");
    assert.deepEqual(await startJob(store, "second"), { ok: true });
  });
}

test("cancelling a queued job preserves another job's lock on its profile", async () => {
  const { store } = rig();
  await saveProfile(store, profile);
  await queue(store, "first");
  await queue(store, "second");
  await queue(store, "third");
  await startJob(store, "first");

  await moveJob(store, "second", "cancelled");
  assert.equal((await getJob(store, "second"))?.state, "cancelled");
  assert.deepEqual(await startJob(store, "third"), { ok: false, heldBy: "first" });
});

test("two concurrent starts have one winner per profile across store wrappers", async () => {
  const { store } = rig();
  const otherProfile = { ...profile, id: "other-profile" };
  await saveProfile(store, profile);
  await saveProfile(store, otherProfile);
  await queue(store, "first");
  await queue(store, "second");
  await queue(store, "third", otherProfile.id);

  const [first, second, third] = await Promise.all([
    startJob(store, "first"), startJob({ ...store }, "second"), startJob(store, "third"),
  ]);
  assert.notEqual(first.ok, second.ok);
  assert.deepEqual(first.ok ? second : first, { ok: false, heldBy: first.ok ? "first" : "second" });
  assert.deepEqual(third, { ok: true });
  assert.equal((await getJob(store, first.ok ? "first" : "second"))?.state, "running");
  assert.equal((await getJob(store, first.ok ? "second" : "first"))?.state, "queued");
});

test("browser steps are shielded before storage and concurrent appends are retained", async () => {
  const { store, records } = rig();
  await saveProfile(store, profile);
  await queue(store, "job");
  await startJob(store, "job");
  await Promise.all([
    appendStep(store, "job", "Filled ••••"),
    appendStep(store, "job", "password=fixture-12345"),
  ]);
  assert.deepEqual((await getJob(store, "job"))?.steps, ["Filled ••••", `password=${HIDDEN}`]);
  assert.doesNotMatch(records.get("job:job")!, /fixture-12345/);
});
