import assert from "node:assert/strict";
import { test } from "node:test";
import { prTwins } from "../src/pomelo/pr-twins.js";

const ticket = { number: 756, key: "P0-121" };

test("an empty list or an unrelated ticket PR allows a new PR", () => {
  for (const json of [
    "[]",
    '[{"number":20,"title":"Other ticket (#7560)","headRefName":"ticket/7560-p0-122","baseRefName":"main","isDraft":false}]',
  ]) {
    assert.deepEqual(prTwins(json, ticket), {
      ok: true,
      verdict: "open-new",
      twins: [],
      reasons: [],
    });
  }
});

test("one PR on the exact branch is reused even if it is a draft", () => {
  const json = '[{"number":22,"title":"PR twin rule (#756)","headRefName":"ticket/756-p0-121","baseRefName":"main","isDraft":true}]';
  assert.deepEqual(prTwins(json, ticket), {
    ok: true,
    verdict: "reuse",
    reuse: 22,
    twins: [],
    reasons: [],
  });
});

test("two PRs on the ticket branch stop the worker and both numbers are sorted", () => {
  const json = `[
    {"number":30,"title":"PR twin rule","headRefName":"ticket/756-p0-121","baseRefName":"main","isDraft":false},
    {"number":24,"title":"Draft PR twin rule","headRefName":"ticket/756-p0-121","baseRefName":"main","isDraft":true}
  ]`;
  const result = prTwins(json, ticket);
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "stop");
  assert.equal(result.reuse, undefined);
  assert.deepEqual(result.twins, [{ ticket: 756, prs: [24, 30] }]);
  assert.match(result.reasons.join(" "), /#756/);
});

test("a title reference catches a second PR on another ticket branch", () => {
  const json = `[
    {"number":30,"title":"PR twin rule (#756)","headRefName":"ticket/756-p0-121","baseRefName":"main","isDraft":false},
    {"number":24,"title":"Retry PR twin rule (#756)","headRefName":"ticket/757-p0-122","baseRefName":"main","isDraft":false}
  ]`;
  const result = prTwins(json, ticket);
  assert.equal(result.ok, false);
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.twins, [{ ticket: 756, prs: [24, 30] }]);
});

test("a lone PR from the wrong ticket branch stops instead of opening a new PR", () => {
  for (const json of [
    '[{"number":24,"title":"PR twin rule","headRefName":"ticket/756-p0-122"}]',
    '[{"number":24,"title":"PR twin rule (#756)","headRefName":"ticket/757-p0-122"}]',
  ]) {
    const result = prTwins(json, ticket);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "stop");
    assert.equal(result.reuse, undefined);
    assert.deepEqual(result.twins, [{ ticket: 756, prs: [24] }]);
    assert.match(result.reasons.join(" "), /#24.*ticket\/756-p0-121/);
  }
});

test("main, import, and docs branches are ignored even when their titles mention the ticket", () => {
  const json = `[
    {"number":22,"title":"Merge (#756)","headRefName":"main"},
    {"number":23,"title":"Import Friday (#756)","headRefName":"import/friday-v0.3.4"},
    {"number":24,"title":"Docs for #756","headRefName":"docs/plan"}
  ]`;
  assert.deepEqual(prTwins(json, ticket), {
    ok: true,
    verdict: "open-new",
    twins: [],
    reasons: [],
  });
});

test("malformed PR list input stops the worker with a plain reason", () => {
  for (const [json, reason] of [
    ["[", /JSON/],
    ["{}", /array/],
    ['[{"number":20,"title":"PR twin rule (#756)"}]', /headRefName/],
    ['[{"number":20,"headRefName":""}]', /headRefName/],
    ['[{"headRefName":"ticket/756-p0-121"}]', /number/],
  ] as const) {
    const result = prTwins(json, ticket);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, "stop");
    assert.equal(result.reuse, undefined);
    assert.match(result.reasons.join(" "), reason);
  }
});

test("other ticket findings are sorted and leave this ticket free to open or reuse", () => {
  const json = `[
    {"number":40,"title":"Other rule","headRefName":"ticket/760-p0-125"},
    {"number":31,"title":"Other change (#755)","headRefName":"ticket/755-p0-120"},
    {"number":32,"title":"Other rule","headRefName":"ticket/760-p0-125"},
    {"number":29,"title":"Other change","headRefName":"ticket/755-p0-120"},
    {"number":21,"title":"PR twin rule (#756)","headRefName":"ticket/756-p0-121"},
    {"number":42,"title":"Another rule (#759)","headRefName":"ticket/761-p0-126"}
  ]`;
  const twins = [
    { ticket: 755, prs: [29, 31] },
    { ticket: 759, prs: [42] },
    { ticket: 760, prs: [32, 40] },
  ];
  assert.deepEqual(prTwins(json, ticket), {
    ok: true,
    verdict: "reuse",
    reuse: 21,
    twins,
    reasons: [],
  });
  assert.deepEqual(prTwins(json, { number: 758, key: "P0-123" }), {
    ok: true,
    verdict: "open-new",
    twins,
    reasons: [],
  });
});
