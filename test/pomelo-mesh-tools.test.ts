import assert from "node:assert/strict";
import test from "node:test";
import { openThreadAsk, POMELO_MESH_TOOLS, spawnSubagentAsk, tagProjectAsk } from "../src/pomelo/mesh-tools.js";

function assertError(result: unknown, message: RegExp) {
  assert.ok(typeof result === "string", "expected an error string");
  assert.match(result, message);
}

test("Pomelo describes exactly three mesh tools and their required fields", () => {
  assert.deepEqual(POMELO_MESH_TOOLS.map((tool) => [tool.name, tool.inputSchema.required]), [
    ["open_thread", ["title", "prompt"]],
    ["spawn_subagent", ["purpose", "prompt"]],
    ["tag_project", ["tags"]],
  ]);
  for (const tool of POMELO_MESH_TOOLS) {
    assert.ok(tool.description.trim(), tool.name);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test("open_thread trims its text and tags, and allows tags to be omitted", () => {
  assert.deepEqual(openThreadAsk({ title: "  Release notes ", prompt: " Draft the notes.\n", tags: [" Docs "], extra: true }), {
    title: "Release notes", prompt: "Draft the notes.", tags: ["Docs"],
  });
  assert.deepEqual(openThreadAsk({ title: "Release notes", prompt: "Draft the notes." }), {
    title: "Release notes", prompt: "Draft the notes.", tags: [],
  });
});

test("spawn_subagent trims its text, and allows the tool to be omitted", () => {
  assert.deepEqual(spawnSubagentAsk({ purpose: " Review docs ", prompt: " Check the examples. ", tool: " codex ", extra: true }), {
    purpose: "Review docs", prompt: "Check the examples.", tool: "codex",
  });
  assert.deepEqual(spawnSubagentAsk({ purpose: "Review docs", prompt: "Check the examples." }), {
    purpose: "Review docs", prompt: "Check the examples.",
  });
});

test("tag_project trims each tag and drops unknown fields", () => {
  const tags = [" Docs ", " Release "];
  assert.deepEqual(tagProjectAsk({ tags, extra: true }), { tags: ["Docs", "Release"] });
  assert.deepEqual(tags, [" Docs ", " Release "]);
});

test("thread and subagent requests need nonempty text fields", () => {
  assertError(openThreadAsk({ prompt: "Draft the notes." }), /title/);
  assertError(spawnSubagentAsk({ prompt: "Check the examples." }), /purpose/);
  assertError(openThreadAsk({ title: "Release notes" }), /prompt/);
  assertError(spawnSubagentAsk({ purpose: "Review docs" }), /prompt/);
  assertError(openThreadAsk({ title: " \n ", prompt: "Draft the notes." }), /title/);
  assertError(spawnSubagentAsk({ purpose: 123, prompt: "Check the examples." }), /purpose/);
  assertError(spawnSubagentAsk({ purpose: "Review docs", prompt: "Check the examples.", tool: null }), /tool/);
});

test("tag lists need one to eight nonempty text entries when supplied", () => {
  assertError(tagProjectAsk({}), /tags/);
  const eightTags = Array.from({ length: 8 }, (_, i) => `Tag ${i + 1}`);
  assert.deepEqual(tagProjectAsk({ tags: eightTags }), { tags: eightTags });
  for (const tags of [[], [...eightTags, "Tag 9"], "Docs", ["Docs", 123], [" "]]) {
    assertError(tagProjectAsk({ tags }), /tags/);
    assertError(openThreadAsk({ title: "Release notes", prompt: "Draft the notes.", tags }), /tags/);
  }
});

test("the checkers accept text at the length limit and reject longer text", () => {
  const title = "a".repeat(120);
  const purpose = "b".repeat(120);
  const prompt = "c".repeat(5000);
  const tag = "d".repeat(32);
  const tool = "e".repeat(32);
  assert.deepEqual(openThreadAsk({ title: ` ${title} `, prompt, tags: [tag] }), { title, prompt, tags: [tag] });
  assert.deepEqual(spawnSubagentAsk({ purpose, prompt, tool }), { purpose, prompt, tool });
  assertError(openThreadAsk({ title: `${title}a`, prompt }), /title.*120/);
  assertError(openThreadAsk({ title, prompt: `${prompt}c` }), /prompt.*5000/);
  assertError(spawnSubagentAsk({ purpose: `${purpose}b`, prompt }), /purpose.*120/);
  assertError(spawnSubagentAsk({ purpose, prompt: `${prompt}c` }), /prompt.*5000/);
  assertError(spawnSubagentAsk({ purpose, prompt, tool: `${tool}e` }), /tool.*32/);
  assertError(tagProjectAsk({ tags: [`${tag}d`] }), /tags.*32/);
});
