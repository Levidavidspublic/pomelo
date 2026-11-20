import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIFACT_PANEL_IDLE,
  artifactPanelReduce,
  type ArtifactPanelEvent,
  type ArtifactPanelState,
} from "../src/client/pomelo/artifact-state.js";

const first = { artifactId: "chart", version: 1 };
const second = { artifactId: "chart", version: 2 };
const other = { artifactId: "diagram", version: 1 };

function openFirst() {
  return artifactPanelReduce(ARTIFACT_PANEL_IDLE, { type: "open", ...first });
}

function showFirst() {
  return artifactPanelReduce(openFirst(), { type: "loaded", ...first });
}

test("opening an artifact loads the requested version before showing it", () => {
  const loading = openFirst();
  assert.equal(loading.kind, "loading");
  assert.deepEqual(loading.requested, first);
  assert.equal(loading.shown, null);

  const ready = artifactPanelReduce(loading, { type: "loaded", ...first });
  assert.equal(ready.kind, "ready");
  assert.deepEqual(ready.shown, first);
  assert.equal(ready.canRetry, false);
});

test("unavailable artifacts have distinct plain status messages", () => {
  for (const [type, kind, label] of [
    ["not_found", "missing", "Artifact not found"],
    ["archived", "put_away", "Artifact put away"],
    ["too_big", "too_big", "Artifact is too large to show"],
  ] as const) {
    const state = artifactPanelReduce(openFirst(), { type, ...first });
    assert.equal(state.kind, kind);
    assert.equal(state.label, label);
    assert.equal(state.shown, null);
    assert.equal(state.canRetry, false);
  }
});

test("a failed first load offers a retry of the same request", () => {
  const failed = artifactPanelReduce(openFirst(), { type: "failed", ...first });
  assert.equal(failed.kind, "failed");
  assert.equal(failed.label, "Could not load artifact");
  assert.equal(failed.shown, null);
  assert.equal(failed.canRetry, true);

  const retry = artifactPanelReduce(failed, { type: "retry" });
  assert.equal(retry.kind, "loading");
  assert.deepEqual(retry.requested, first);
  assert.equal(retry.canRetry, false);
});

test("a failure while ready keeps the shown version and offers a retry", () => {
  const ready = showFirst();
  const failed = artifactPanelReduce(ready, { type: "failed", ...first });
  assert.equal(failed.kind, "ready");
  assert.equal(failed.shown, ready.shown);
  assert.match(failed.note ?? "", /^Could not refresh\b/);
  assert.match(failed.screenReaderLine, /Could not refresh/);
  assert.equal(failed.canRetry, true);
});

test("a failed version change keeps the earlier version through retry", () => {
  const ready = showFirst();
  const loading = artifactPanelReduce(ready, { type: "open", ...second });
  assert.equal(loading.kind, "loading");
  assert.equal(loading.shown, ready.shown);

  const failed = artifactPanelReduce(loading, { type: "failed", ...second });
  assert.equal(failed.kind, "ready");
  assert.equal(failed.shown, ready.shown);
  assert.deepEqual(failed.requested, second);
  assert.equal(failed.canRetry, true);

  const retry = artifactPanelReduce(failed, { type: "retry" });
  assert.equal(retry.kind, "loading");
  assert.equal(retry.shown, ready.shown);
  assert.deepEqual(retry.requested, second);
  assert.equal(retry.note, undefined);

  const loaded = artifactPanelReduce(retry, { type: "loaded", ...second });
  assert.equal(loaded.kind, "ready");
  assert.deepEqual(loaded.shown, second);
  assert.equal(loaded.note, undefined);
  assert.equal(loaded.canRetry, false);
});

test("opening another artifact starts with a loading message and no version on screen", () => {
  const loading = artifactPanelReduce(showFirst(), { type: "open", ...other });
  assert.equal(loading.kind, "loading");
  assert.equal(loading.shown, null);
  assert.equal(artifactPanelReduce(loading, { type: "failed", ...other }).kind, "failed");
});

test("late results for another artifact or version leave the current request intact", () => {
  const loading = artifactPanelReduce(openFirst(), { type: "open", ...second });
  assert.equal(artifactPanelReduce(loading, { type: "loaded", ...other, version: second.version }), loading);
  assert.equal(artifactPanelReduce(loading, { type: "loaded", ...first }), loading);
  assert.equal(artifactPanelReduce(loading, { type: "failed", ...first }), loading);
  assert.equal(artifactPanelReduce(loading, { type: "archived", ...other }), loading);

  const ready = artifactPanelReduce(loading, { type: "loaded", ...second });
  assert.equal(artifactPanelReduce(ready, { type: "loaded", ...first }), ready);
});

const states: ArtifactPanelState[] = [
  ARTIFACT_PANEL_IDLE,
  openFirst(),
  showFirst(),
  artifactPanelReduce(openFirst(), { type: "not_found", ...first }),
  artifactPanelReduce(openFirst(), { type: "archived", ...first }),
  artifactPanelReduce(openFirst(), { type: "too_big", ...first }),
  artifactPanelReduce(openFirst(), { type: "failed", ...first }),
  artifactPanelReduce(showFirst(), { type: "failed", ...first }),
];

test("close returns idle from every state and late responses leave it idle", () => {
  for (const state of states) {
    assert.equal(artifactPanelReduce(state, { type: "close" }), ARTIFACT_PANEL_IDLE);
  }
  assert.equal(artifactPanelReduce(ARTIFACT_PANEL_IDLE, { type: "loaded", ...first }), ARTIFACT_PANEL_IDLE);
  assert.equal(artifactPanelReduce(ARTIFACT_PANEL_IDLE, { type: "failed", ...first }), ARTIFACT_PANEL_IDLE);
});

test("unknown events and retries without a retry action leave state unchanged", () => {
  const unknown = { type: "unexpected" };
  for (const state of states) {
    assert.equal(artifactPanelReduce(state, unknown as ArtifactPanelEvent), state);
    if (!state.canRetry) assert.equal(artifactPanelReduce(state, { type: "retry" }), state);
  }
});

test("every state has a short label and a screen-reader line, and only loading is busy", () => {
  assert.deepEqual(states.map(({ kind }) => kind), [
    "idle", "loading", "ready", "missing", "put_away", "too_big", "failed", "ready",
  ]);
  for (const state of states) {
    assert.ok(state.label.trim().length > 0);
    assert.ok(state.screenReaderLine.trim().length > 0);
    assert.equal(state.busy, state.kind === "loading");
  }
});

test("status text never uses artifact data or error details", () => {
  const selection = { artifactId: "sample-identifier", version: 1 };
  const loading = artifactPanelReduce(ARTIFACT_PANEL_IDLE, { type: "open", ...selection });
  const result = {
    type: "loaded" as const,
    ...selection,
    title: "Sample title",
    body: "Sample body",
    path: "example/sample.html",
  };
  const ready = artifactPanelReduce(loading, result);
  const error = { type: "failed" as const, ...selection, message: "Sample error" };
  const failed = artifactPanelReduce(loading, error);
  const refreshFailed = artifactPanelReduce(ready, error);
  for (const { label, screenReaderLine, note } of [loading, ready, failed, refreshFailed]) {
    assert.doesNotMatch([label, screenReaderLine, note].join(" "), /sample|example/i);
  }
});
