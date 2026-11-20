import assert from "node:assert/strict";
import test from "node:test";
import { decideTagCall, type TagCallDecision, type TagCallInput } from "../src/pomelo/tag-propose.js";

const caller = Object.freeze({ agentId: "agent:research", isSubAgent: false });
const subAgent = Object.freeze({ ...caller, isSubAgent: true });
const projectTags = Object.freeze(["orchard"]);
const untagged = Object.freeze([]);
const request: TagCallInput = {
  openedBy: caller.agentId,
  projectTags,
  tagsSetByAmit: false,
  caller,
};

const cases: { name: string; input: Partial<TagCallInput>; verdict: TagCallDecision["verdict"] }[] = [
  { name: "a tag already on the thread", input: { slug: "orchard", tagsSetByAmit: true }, verdict: "already" },
  { name: "a duplicate tag requested by a sub-agent", input: { slug: "orchard", caller: subAgent }, verdict: "already" },
  { name: "a new tag requested by a sub-agent", input: { slug: "garden", caller: subAgent }, verdict: "refuse" },
  { name: "the calling agent's tagged thread", input: { slug: "garden" }, verdict: "set" },
  { name: "an untagged thread Amit opened", input: { slug: "garden", openedBy: "amit", projectTags: untagged }, verdict: "set" },
  { name: "a tagged thread Amit opened", input: { slug: "garden", openedBy: "amit" }, verdict: "propose" },
  { name: "the calling agent's thread after Amit retags it", input: { slug: "garden", tagsSetByAmit: true }, verdict: "propose" },
  { name: "the calling agent's thread after Amit clears its tags", input: { slug: "garden", tagsSetByAmit: true, projectTags: untagged }, verdict: "propose" },
  { name: "a tagged thread opened by another agent", input: { slug: "garden", openedBy: "agent:writer" }, verdict: "propose" },
  { name: "an empty slug", input: { slug: "" }, verdict: "refuse" },
  { name: "a whitespace-only slug", input: { slug: " \t" }, verdict: "refuse" },
  { name: "a missing slug", input: {}, verdict: "refuse" },
];

for (const { name, input, verdict } of cases) {
  test(`${name} gives ${verdict}`, () => {
    const call = Object.freeze({ ...request, ...input });
    const decision = decideTagCall(call);

    assert.equal(decision.verdict, verdict);
    assert.match(decision.reason, /\S/);
    assert.doesNotMatch(decision.reason, /[\r\n\u2028\u2029]/);
    assert.ok(!decision.reason.includes(call.caller.agentId));
  });
}
