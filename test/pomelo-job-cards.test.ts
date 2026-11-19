import assert from "node:assert/strict";
import test from "node:test";
import { cleanCard } from "../src/gen-ui-model.js";
import { HOLD_REASONS, holdAnswer, holdCard } from "../src/pomelo/job-cards.js";

const jobId = "job-42";

function clean(args: Parameters<typeof cleanCard>[0]) {
  const result = cleanCard(args);
  assert.ok("card" in result, "error" in result ? result.error : undefined);
  return result.card;
}

test("a locked vault asks the user to unlock 1Password and confirm", () => {
  const card = clean(holdCard({ reason: "vault_locked", jobId }));
  assert.equal(card.title, "Unlock 1Password");
  assert.equal(card.kind, "goahead");
  assert.equal(card.approve, "I unlocked it");
  assert.equal(card.wait, true);
  assert.equal(holdAnswer("vault_locked", card.approve), "continue");
  assert.equal(holdAnswer("vault_locked", "Hold"), null);
});

test("an unreachable cloud browser offers retry and cancel", () => {
  const card = clean(holdCard({ reason: "cloud_unreachable", jobId }));
  assert.equal(card.title, "VPS not reachable");
  assert.equal(card.kind, "choices");
  assert.equal(card.wait, true);
  assert.deepEqual(card.options?.map(({ label }) => label), ["Retry", "Cancel job"]);
  assert.equal(holdAnswer("cloud_unreachable", "Retry"), "retry");
  assert.equal(holdAnswer("cloud_unreachable", "Cancel job"), "cancel");
});

test("a partial import shows the result for each site", () => {
  const card = clean(holdCard({
    reason: "import_partial",
    jobId,
    sites: [
      { host: "one.example", result: "imported" },
      { host: "two.example", result: "expired" },
      { host: "three.example", result: "incompatible" },
      { host: "four.example", result: "skipped" },
    ],
  }));
  assert.equal(card.kind, "table");
  assert.deepEqual(card.columns, ["Site", "Result"]);
  assert.deepEqual(card.rows, [
    ["one.example", "imported"],
    ["two.example", "expired"],
    ["three.example", "incompatible"],
    ["four.example", "skipped"],
  ]);
});

test("a partial import with no sites still produces a card", () => {
  for (const sites of [undefined, []]) {
    const card = clean(holdCard({ reason: "import_partial", jobId, sites }));
    assert.equal(card.title, "Partial import");
    assert.match(JSON.stringify(card), /No site results available/);
  }
});

test("an unknown reason shows a plain waiting card and only offered labels act on a job", () => {
  assert.deepEqual(HOLD_REASONS, ["vault_locked", "cloud_unreachable", "import_partial"]);
  const card = clean(holdCard({ reason: "other", jobId }));
  assert.equal(card.title, "Job is waiting");
  assert.match(JSON.stringify(card), /job-42/);
  assert.equal(card.actions, undefined);
  assert.equal(card.options, undefined);
  assert.equal(card.wait, undefined);

  assert.equal(holdAnswer("other", "Retry"), null);
  assert.equal(holdAnswer("import_partial", "Retry"), null);
  assert.equal(holdAnswer("vault_locked", "Cancel job"), null);
  assert.equal(holdAnswer("cloud_unreachable", "I unlocked it"), null);
  assert.equal(holdAnswer("cloud_unreachable", "Something else"), null);
});

test("card arguments and cleaned cards omit job steps, endpoints, references and raw errors", () => {
  const canary = "hold-card-canary";
  const cdpAddress = `ws://cloud.example/devtools/${canary}`;
  const opRef = `op://fixture/item/${canary}`;
  const job = {
    jobId,
    steps: [{ text: canary }],
    cdpAddress,
    opRef,
    error: `Connection failed: ${canary}`,
    sites: [{ host: "one.example", result: "expired", error: canary }],
  };
  for (const reason of [...HOLD_REASONS, job.error]) {
    const args = holdCard({ ...job, reason });
    for (const card of [args, clean(args)]) {
      assert.doesNotMatch(JSON.stringify(card), /hold-card-canary|ws:\/\/|op:\/\//);
    }
  }

  const args = holdCard({
    reason: "import_partial",
    jobId: cdpAddress,
    sites: [{ host: cdpAddress, result: opRef }, { host: opRef, result: job.error }],
  });
  assert.doesNotMatch(JSON.stringify(args), /hold-card-canary|ws:\/\/|op:\/\//);
  assert.doesNotMatch(JSON.stringify(clean(args)), /hold-card-canary|ws:\/\/|op:\/\//);
});
