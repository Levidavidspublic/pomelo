import assert from "node:assert/strict";
import test from "node:test";
import { browserPanel, type PanelJob, type PanelProfile } from "../src/client/pomelo/browser-panel.js";

const local = { id: "local", name: "Local browser", location: "local" } satisfies PanelProfile;
const cloud = { id: "cloud", name: "Cloud browser", location: "cloud", cdpUrlName: "TEST_CDP_URL_NAME" } satisfies PanelProfile;

function job(id: string, overrides: Partial<PanelJob> = {}): PanelJob {
  return { id, threadId: "thread", laneId: "lane", profileId: local.id, state: "queued", steps: [], updatedAt: 0, ...overrides };
}

test("the browser panel lists only this thread's jobs, newest first with ties ordered by id", () => {
  const jobs = Object.freeze([
    job("b", { updatedAt: 10 }),
    job("other", { threadId: "other-thread", state: "running", updatedAt: 30 }),
    job("a", { updatedAt: 10, laneId: "other-lane" }),
    job("c", { updatedAt: 20 }),
    job("undated", { updatedAt: undefined }),
  ]);

  const panel = browserPanel({ threadId: "thread", jobs, profiles: [local] });

  assert.deepEqual(panel.rows.map(({ id }) => id), ["c", "a", "b", "undated"]);
  assert.equal(panel.activeJobId, null);
  assert.equal(panel.vps, false);
});

test("browser jobs use plain state labels and unknown states display as Waiting", () => {
  const states = ["queued", "running", "waiting", "done", "failed", "cancelled", "toString"];
  const jobs = states.map((state, index) => job(state, { state, updatedAt: states.length - index }));
  const panel = browserPanel({ threadId: "thread", jobs, profiles: [local] });

  assert.deepEqual(panel.rows.map(({ label }) => label), ["Queued", "Running", "Waiting", "Done", "Failed", "Cancelled", "Waiting"]);
  assert.equal(panel.activeJobId, "running");
});

test("rows display profile names, VPS status and the last masked step without CDP metadata", () => {
  const lastStep = "  Filled ••••\n";
  const jobs = [
    job("a", { profileId: cloud.id, steps: ["Opened form", lastStep] }),
    job("b"),
    job("c", { profileId: "missing" }),
  ];
  const panel = browserPanel({ threadId: "thread", jobs, profiles: [local, cloud] });

  assert.deepEqual(panel.rows, [
    { id: "a", label: "Queued", state: "queued", profileName: "Cloud browser", vps: true, lastStep },
    { id: "b", label: "Queued", state: "queued", profileName: "Local browser", vps: false, lastStep: "" },
    { id: "c", label: "Queued", state: "queued", profileName: "Unknown profile", vps: false, lastStep: "" },
  ]);
  const serialized = JSON.stringify(panel);
  assert.equal(serialized.includes("cdpUrlName"), false);
  assert.equal(serialized.includes(cloud.cdpUrlName), false);
  assert.equal(panel.vps, false);
});

test("the panel VPS badge follows the newest running or waiting job", () => {
  const running = job("running", { state: "running", updatedAt: 10 });
  const waiting = job("waiting", { state: "waiting", profileId: cloud.id, updatedAt: 20 });
  const done = job("done", { state: "done", profileId: cloud.id, updatedAt: 30 });
  const unknown = job("unknown", { state: "paused", profileId: cloud.id, updatedAt: 40 });
  const input = { threadId: "thread", profiles: [local, cloud] };

  const cloudActive = browserPanel({ ...input, jobs: [running, waiting, done, unknown] });
  assert.equal(cloudActive.activeJobId, waiting.id);
  assert.equal(cloudActive.vps, true);

  const localActive = browserPanel({ ...input, jobs: [running, done, unknown] });
  assert.equal(localActive.activeJobId, running.id);
  assert.equal(localActive.vps, false);

  const inactive = browserPanel({ ...input, jobs: [done, unknown] });
  assert.equal(inactive.activeJobId, null);
  assert.equal(inactive.vps, false);
});

test("the panel is masked by default and only turns the badge off on explicit request", () => {
  const input = { threadId: "thread", jobs: [], profiles: [] };

  assert.deepEqual(browserPanel(input), { rows: [], activeJobId: null, masked: true, vps: false });
  assert.equal(browserPanel({ ...input, maskOff: false }).masked, true);
  assert.equal(browserPanel({ ...input, maskOff: true }).masked, false);
});
