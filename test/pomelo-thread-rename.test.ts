import assert from "node:assert/strict";
import test from "node:test";
import { renameThread } from "../src/pomelo/thread-rename.js";

const agentTitle = Object.freeze({ title: "Draft plan", titleBy: "agent" } as const);

test("Amit can rename an agent-titled thread and keep renaming it", () => {
  const request = Object.freeze({ title: "  Release plan  ", by: "amit" } as const);
  const first = renameThread(agentTitle, request);
  assert.deepEqual(first, { ok: true, changed: true, title: "Release plan", titleBy: "amit" });
  assert.deepEqual(renameThread(first, { title: "Final plan", by: "amit" }), {
    ok: true, changed: true, title: "Final plan", titleBy: "amit",
  });
});

test("an agent cannot replace Amit's title", () => {
  const current = renameThread(agentTitle, { title: "Release plan", by: "amit" });
  assert.deepEqual(renameThread(current, { title: "Later agent draft", by: "agent" }), {
    ok: false, changed: false, title: "Release plan", titleBy: "amit", reason: "Amit named this thread.",
  });
});

test("an agent can rename a thread before Amit names it, including a legacy thread", () => {
  for (const current of [agentTitle, { title: "Draft plan" }]) {
    assert.deepEqual(renameThread(current, { title: "Release plan", by: "agent" }), {
      ok: true, changed: true, title: "Release plan", titleBy: "agent",
    });
  }
});

test("empty titles are refused even when they become empty during cleaning", () => {
  for (const by of ["amit", "agent"] as const) {
    for (const title of ["", "  \t\n  ", "\u0000\u202e\u200f"]) {
      assert.deepEqual(renameThread(agentTitle, { title, by }), {
        ok: false, changed: false, ...agentTitle, reason: "Enter a thread title.",
      });
    }
  }
});

test("the same cleaned title leaves the text and attribution unchanged", () => {
  for (const by of ["amit", "agent"] as const) {
    assert.deepEqual(renameThread(agentTitle, { title: "  Draft plan  ", by }), {
      ok: true, changed: false, ...agentTitle,
    });
  }
  assert.deepEqual(renameThread({ title: "Draft plan" }, { title: "Draft plan", by: "agent" }), {
    ok: true, changed: false, title: "Draft plan", titleBy: undefined,
  });
});

test("Hebrew and mixed Hebrew and English titles keep their characters", () => {
  for (const title of ["תִּכְנוּן הפרויקט", "תִּכְנוּן release 2"]) {
    assert.equal(renameThread(agentTitle, { title, by: "amit" }).title, title);
  }
});

test("long titles keep whole emoji and accented Hebrew letters at the limit", () => {
  const prefix = "א".repeat(78);
  for (const character of ["👩🏽‍💻", "שָׁ"]) {
    const title = `${prefix}${character}${"ב".repeat(100)}`;
    const result = renameThread(agentTitle, { title, by: "amit" });
    assert.equal(result.title, `${prefix}${character}…`);
  }
});

test("a token near the length limit is masked before the title is shortened", () => {
  const prefix = "א".repeat(70);
  const token = "sk-" + "x".repeat(40);
  const result = renameThread(agentTitle, { title: `${prefix} ${token}`, by: "amit" });
  assert.deepEqual(result, { ok: true, changed: true, title: `${prefix} [hidden]`, titleBy: "amit" });
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("controls and bidirectional marks are removed while mixed text stays intact", () => {
  const title = "\u0000\u200fתכנון\t\u202erelease\u202c\u2069\u007f";
  assert.equal(renameThread(agentTitle, { title, by: "agent" }).title, "תכנון release");
});
