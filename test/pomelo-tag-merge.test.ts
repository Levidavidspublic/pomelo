import assert from "node:assert/strict";
import test from "node:test";
import { planTagMerge } from "../src/pomelo/tag-merge.js";

const source = Object.freeze({ slug: "orchard", label: "Orchard", colour: "green", createdBy: "owner" });
const target = Object.freeze({ slug: "garden", label: "Garden", createdBy: "agent:research" });
const tags = Object.freeze([source, target]);
const request = { fromSlug: source.slug, intoSlug: target.slug, tags, threads: [] };

test("a merge plans writes for both matching threads in thread id order", () => {
  const threads = Object.freeze([
    Object.freeze({ sid: "thread-b", projectTags: Object.freeze(["orchard"]), lastActivityAt: 200 }),
    Object.freeze({ sid: "thread-c", projectTags: Object.freeze(["garden"]), lastActivityAt: 300 }),
    Object.freeze({ sid: "thread-a", projectTags: Object.freeze(["orchard"]), lastActivityAt: 100 }),
  ]);

  assert.deepEqual(planTagMerge({ ...request, threads }), {
    ok: true,
    threadWrites: [
      { sid: "thread-a", projectTags: ["garden"] },
      { sid: "thread-b", projectTags: ["garden"] },
    ],
    tagWrite: { ...source, mergedInto: "garden" },
  });
});

test("replacing the source keeps tag order and the first occurrence of each resulting tag", () => {
  const threads = [
    { sid: "source-first", projectTags: ["notes", "orchard", "work", "garden", "notes"] },
    { sid: "target-first", projectTags: ["notes", "garden", "work", "orchard"] },
  ];

  const result = planTagMerge({ ...request, threads });

  assert.ok(result.ok);
  assert.deepEqual(result.threadWrites, [
    { sid: "source-first", projectTags: ["notes", "garden", "work"] },
    { sid: "target-first", projectTags: ["notes", "garden", "work"] },
  ]);
});

test("a merge with no matching threads still marks the source tag and retains its fields", () => {
  assert.deepEqual(planTagMerge(request), {
    ok: true,
    threadWrites: [],
    tagWrite: { ...source, mergedInto: "garden" },
  });
});

test("merging a tag into itself is refused", () => {
  assert.deepEqual(planTagMerge({ ...request, intoSlug: source.slug }), {
    ok: false,
    reason: "same-slug",
  });
});

test("an unknown source or target is refused", () => {
  for (const slugs of [{ fromSlug: "missing" }, { intoSlug: "missing" }]) {
    assert.deepEqual(planTagMerge({ ...request, ...slugs }), { ok: false, reason: "unknown-tag" });
  }
});

test("a target already merged elsewhere is refused, including when it points to the source", () => {
  const other = { slug: "field", label: "Field", createdBy: "owner" };
  for (const mergedInto of [other.slug, source.slug]) {
    assert.deepEqual(planTagMerge({ ...request, tags: [source, { ...target, mergedInto }, other] }), {
      ok: false,
      reason: "target-merged",
    });
  }
});

test("a source with an existing alias is refused to avoid creating a chain", () => {
  const alias = { slug: "grove", label: "Grove", createdBy: "owner", mergedInto: source.slug };
  assert.deepEqual(planTagMerge({ ...request, tags: [...tags, alias] }), {
    ok: false,
    reason: "source-has-aliases",
  });
});

test("Hebrew slugs and the source label retain their letters and vowel marks", () => {
  const hebrewSource = { ...source, slug: "מַטָּע", label: "מַטָּע קָטָן" };
  const hebrewTarget = { ...target, slug: "גַּן", label: "גַּן גָּדוֹל" };

  assert.deepEqual(planTagMerge({
    fromSlug: hebrewSource.slug,
    intoSlug: hebrewTarget.slug,
    tags: [hebrewSource, hebrewTarget],
    threads: [{ sid: "thread-a", projectTags: [hebrewSource.slug, "notes"] }],
  }), {
    ok: true,
    threadWrites: [{ sid: "thread-a", projectTags: ["גַּן", "notes"] }],
    tagWrite: { ...hebrewSource, label: "מַטָּע קָטָן", mergedInto: "גַּן" },
  });
});
