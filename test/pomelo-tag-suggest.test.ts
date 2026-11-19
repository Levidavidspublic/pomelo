import assert from "node:assert/strict";
import test from "node:test";
import { acceptSuggestion, dismissSuggestion, suggestionChips } from "../src/client/pomelo/tag-suggest.js";
import type { TagProposal } from "../src/client/pomelo/tag-suggest.js";

const thread = { id: "thread-1", projectTags: ["build", "docs"] };

function proposal(slug: string, at: number, overrides: Partial<TagProposal> = {}): TagProposal {
  return { threadId: thread.id, slug, label: slug, proposedBy: "agent-1", at, ...overrides };
}

test("suggestions exclude existing tags, dismissed slugs, and proposals for other threads", () => {
  const visible = proposal("phase-1", 1);
  const proposals = [
    proposal("build", 5),
    proposal("review", 4),
    proposal("phase-1", 3, { threadId: "thread-2" }),
    visible,
  ];

  assert.deepEqual(suggestionChips(thread, proposals, ["review"]), [visible]);
});

test("duplicate proposals for a slug keep the newest proposal", () => {
  const newest = proposal("review", 10, { label: "Review", proposedBy: "agent-2" });
  const older = proposal("review", 5);

  assert.deepEqual(suggestionChips(thread, [older, newest], []), [newest]);
  assert.deepEqual(suggestionChips(thread, [newest, older], []), [newest]);
});

test("only the three newest chips appear, in descending timestamp order", () => {
  const proposals = [proposal("one", 1), proposal("five", 5), proposal("three", 3), proposal("two", 2), proposal("four", 4)];

  assert.deepEqual(suggestionChips(thread, proposals, []).map((chip) => chip.slug), ["five", "four", "three"]);
});

test("chip labels are trimmed and capped at 40 characters while preserving Hebrew", () => {
  const proposals = [
    proposal("long", 3, { label: `  ${"a".repeat(60)}  ` }),
    proposal("pomelo", 2, { label: "פומלו" }),
    proposal("review", 1, { label: "  Project review  " }),
  ];

  assert.deepEqual(suggestionChips(thread, proposals, []).map((chip) => chip.label), ["a".repeat(40), "פומלו", "Project review"]);
});

test("suggestions ignore slugs outside lowercase letters, digits, and dashes", () => {
  const invalid = ["", "UPPER", "with_space", "with space", "trailing\n", "פומלו"];
  const valid = proposal("phase-2", 1);
  const proposals = [...invalid.map((slug) => proposal(slug, 2)), valid];

  assert.deepEqual(suggestionChips(thread, proposals, []), [valid]);
});

test("accepting a suggestion appends the slug once and hides its chip immediately", () => {
  const projectTags = acceptSuggestion(thread, "review");
  const updated = { ...thread, projectTags };

  assert.deepEqual(projectTags, ["build", "docs", "review"]);
  assert.deepEqual(acceptSuggestion(updated, "review"), projectTags);
  assert.deepEqual(suggestionChips(updated, [proposal("review", 1)], []), []);
});

test("accepting a suggestion also works for a thread without stored tags", () => {
  const untagged = { id: thread.id };
  const review = proposal("review", 1);

  assert.deepEqual(suggestionChips(untagged, [review]), [review]);
  assert.deepEqual(acceptSuggestion(untagged, "review"), ["review"]);
});

test("dismissal records the slug once for the selected thread", () => {
  const dismissed = { [thread.id]: ["older"], "thread-2": ["other"] };
  const updated = dismissSuggestion(dismissed, thread.id, "review");

  assert.deepEqual(updated, { [thread.id]: ["older", "review"], "thread-2": ["other"] });
  assert.deepEqual(suggestionChips(thread, [proposal("review", 1)], updated[thread.id]), []);
  assert.deepEqual(dismissSuggestion(updated, thread.id, "review"), updated);
  assert.deepEqual(dismissSuggestion(updated, "thread-3", "review"), { ...updated, "thread-3": ["review"] });
});

test("suggestion actions leave frozen inputs unchanged", () => {
  const frozenThread = Object.freeze({ ...thread, projectTags: Object.freeze([...thread.projectTags]) });
  const proposals = Object.freeze([
    Object.freeze(proposal("review", 1, { label: "  Review  " })),
    Object.freeze(proposal("test", 2)),
  ]);
  const dismissed = Object.freeze({ [thread.id]: Object.freeze(["older"]) });
  const original = structuredClone({ thread: frozenThread, proposals, dismissed });

  suggestionChips(frozenThread, proposals, dismissed[thread.id]);
  acceptSuggestion(frozenThread, "review");
  dismissSuggestion(dismissed, thread.id, "review");

  assert.deepEqual({ thread: frozenThread, proposals, dismissed }, original);
});
