import assert from "node:assert/strict";
import test from "node:test";
import { panelReduce, type PanelState } from "../src/client/pomelo/artifact-panel.js";

const closed: PanelState = { open: null };

test("tapping an artifact card opens its version and pins it if it is older", () => {
  const older = panelReduce(closed, { type: "open", artifactId: "chart", version: 1, latest: 3 });
  assert.deepEqual(older, { open: { artifactId: "chart", version: 1, pinned: true } });

  const latest = panelReduce(older, { type: "open", artifactId: "diagram", version: 2, latest: 2 });
  assert.deepEqual(latest, { open: { artifactId: "diagram", version: 2, pinned: false } });
});

test("picking an older version pins it and picking the latest resumes updates", () => {
  const latest = panelReduce(closed, { type: "open", artifactId: "chart", version: 3, latest: 3 });
  const older = panelReduce(latest, { type: "pick", version: 2, latest: 3 });
  assert.deepEqual(older, { open: { artifactId: "chart", version: 2, pinned: true } });
  assert.equal(panelReduce(older, { type: "newVersion", artifactId: "chart", version: 4 }), older);

  const resumed = panelReduce(older, { type: "pick", version: 4, latest: 4 });
  assert.deepEqual(resumed, { open: { artifactId: "chart", version: 4, pinned: false } });
  assert.deepEqual(panelReduce(resumed, { type: "newVersion", artifactId: "chart", version: 5 }), {
    open: { artifactId: "chart", version: 5, pinned: false },
  });
});

test("the panel only follows newer versions of the artifact it is showing", () => {
  const state = panelReduce(closed, { type: "open", artifactId: "chart", version: 3, latest: 3 });
  assert.equal(panelReduce(state, { type: "newVersion", artifactId: "diagram", version: 4 }), state);
  assert.equal(panelReduce(state, { type: "newVersion", artifactId: "chart", version: 2 }), state);
  assert.equal(panelReduce(state, { type: "newVersion", artifactId: "chart", version: 3 }), state);
});

test("closing clears the selection and later picks or updates leave the panel closed", () => {
  const state = panelReduce(closed, { type: "open", artifactId: "chart", version: 1, latest: 2 });
  const dismissed = panelReduce(state, { type: "close" });
  assert.deepEqual(dismissed, closed);
  assert.equal(panelReduce(dismissed, { type: "pick", version: 2, latest: 2 }), dismissed);
  assert.equal(panelReduce(dismissed, { type: "newVersion", artifactId: "chart", version: 3 }), dismissed);
  assert.equal(panelReduce(dismissed, { type: "close" }), dismissed);
});

test("empty artifact ids and invalid version numbers leave the same state object", () => {
  const state = panelReduce(closed, { type: "open", artifactId: "chart", version: 2, latest: 2 });
  assert.equal(panelReduce(state, { type: "open", artifactId: "", version: 2, latest: 2 }), state);
  assert.equal(panelReduce(state, { type: "newVersion", artifactId: "", version: 3 }), state);

  for (const invalid of [0, -1, 2.5, NaN, Infinity]) {
    assert.equal(panelReduce(state, { type: "open", artifactId: "chart", version: invalid, latest: 3 }), state);
    assert.equal(panelReduce(state, { type: "open", artifactId: "chart", version: 3, latest: invalid }), state);
    assert.equal(panelReduce(state, { type: "pick", version: invalid, latest: 3 }), state);
    assert.equal(panelReduce(state, { type: "pick", version: 3, latest: invalid }), state);
    assert.equal(panelReduce(state, { type: "newVersion", artifactId: "chart", version: invalid }), state);
  }
});

test("updates work with a frozen state and selection", () => {
  const state: PanelState = Object.freeze({
    open: Object.freeze({ artifactId: "chart", version: 2, pinned: false }),
  });
  assert.deepEqual(panelReduce(state, { type: "newVersion", artifactId: "chart", version: 3 }), {
    open: { artifactId: "chart", version: 3, pinned: false },
  });
  assert.deepEqual(panelReduce(state, { type: "pick", version: 1, latest: 2 }), {
    open: { artifactId: "chart", version: 1, pinned: true },
  });
  assert.deepEqual(state, { open: { artifactId: "chart", version: 2, pinned: false } });
});
