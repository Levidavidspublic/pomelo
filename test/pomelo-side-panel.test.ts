import assert from "node:assert/strict";
import test from "node:test";
import { nextPanel, openingPanel, parseSavedPanel, savedPanel, SIDE_PANELS } from "../src/client/pomelo/side-panel.js";

test("opens with the side panel closed when no panels are available", () => {
  assert.equal(openingPanel({ saved: null, available: [] }), null);
  assert.equal(openingPanel({ saved: "work", available: [] }), null);
});

test("opens the saved panel when it is available", () => {
  assert.equal(openingPanel({ saved: "work", available: ["browser", "artifact", "work"] }), "work");
});

test("falls back in browser, artifact, work order regardless of availability order", () => {
  assert.equal(openingPanel({ saved: null, available: ["work", "artifact", "browser"] }), "browser");
  assert.equal(openingPanel({ saved: "artifact", available: ["work", "browser"] }), "browser");
  assert.equal(openingPanel({ saved: "browser", available: ["work", "artifact"] }), "artifact");
  assert.equal(openingPanel({ saved: "artifact", available: ["work"] }), "work");
});

test("ignores an unrecognized saved panel", () => {
  assert.equal(parseSavedPanel("unknown"), null);
  assert.equal(openingPanel({ saved: "unknown", available: ["work", "artifact"] }), "artifact");
});

test("switches to the available panel associated with each event", () => {
  assert.equal(nextPanel("browser", "card-tapped", SIDE_PANELS), "artifact");
  assert.equal(nextPanel("artifact", "job-started", SIDE_PANELS), "browser");
  assert.equal(nextPanel(null, "subagent-tapped", SIDE_PANELS), "work");
});

test("keeps the current selection when the event's panel is unavailable", () => {
  assert.equal(nextPanel("work", "card-tapped", ["browser", "work"]), "work");
  assert.equal(nextPanel(null, "job-started", ["work"]), null);
});

test("round-trips each panel as its plain name", () => {
  assert.deepEqual(SIDE_PANELS, ["browser", "artifact", "work"]);
  assert.equal(parseSavedPanel(null), null);

  for (const panel of SIDE_PANELS) {
    assert.equal(savedPanel(panel), panel);
    assert.equal(parseSavedPanel(savedPanel(panel)), panel);
  }
});
