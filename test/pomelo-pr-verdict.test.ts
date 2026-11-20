import assert from "node:assert/strict";
import test from "node:test";
import { prGuardVerdict, type GuardAnswer, type PrVerdictInput } from "../src/pomelo/pr-verdict.js";

function answer(name: string, verdict: GuardAnswer["verdict"] = "ok", findings = 0): GuardAnswer {
  return { name, ran: true, verdict, findings };
}

test("merges when all required guards ran and found nothing", () => {
  const input: PrVerdictInput = {
    required: ["secrets", "scope"],
    answers: [answer("secrets"), answer("scope")],
  };

  assert.deepEqual(prGuardVerdict(input), {
    verdict: "merge",
    reasons: [
      { name: "scope", reason: "ok", findings: 0 },
      { name: "secrets", reason: "ok", findings: 0 },
    ],
  });
});

test("holds for a guard that asks for review and names it", () => {
  const result = prGuardVerdict({
    required: ["dependencies", "scope"],
    answers: [answer("scope"), answer("dependencies", "hold", 2)],
  });

  assert.equal(result.verdict, "hold");
  assert.deepEqual(result.reasons[0], { name: "dependencies", reason: "hold for review", findings: 2 });
});

test("a stop beats a hold in either order", () => {
  const answers = [answer("scope", "hold"), answer("secrets", "stop", 1)];
  for (const order of [answers, [...answers].reverse()]) {
    const result = prGuardVerdict({ required: ["secrets", "scope"], answers: order });

    assert.deepEqual(result, {
      verdict: "stop",
      reasons: [
        { name: "scope", reason: "hold for review", findings: 0 },
        { name: "secrets", reason: "guard stopped", findings: 1 },
      ],
    });
  }
});

test("names a missing required guard and says it did not run", () => {
  const result = prGuardVerdict({ required: ["tests-first"], answers: [answer("scope")] });

  assert.deepEqual(result, {
    verdict: "stop",
    reasons: [{ name: "tests-first", reason: "not run" }],
  });
});

test("stops when a required guard says it did not run", () => {
  const result = prGuardVerdict({
    required: ["scope"],
    answers: [{ ...answer("scope"), ran: false }],
  });

  assert.deepEqual(result, {
    verdict: "stop",
    reasons: [{ name: "scope", reason: "not run", findings: 0 }],
  });
});

test("names the guard with an unknown verdict without echoing the verdict", () => {
  const result = prGuardVerdict({
    required: ["scope"],
    answers: [{ ...answer("scope"), verdict: "unexpected status" }],
  });

  assert.deepEqual(result, {
    verdict: "stop",
    reasons: [{ name: "scope", reason: "unknown verdict", findings: 0 }],
  });
});

test("stops for duplicate answers that differ in verdict, run status, or count", () => {
  const first = answer("scope");
  for (const second of [answer("scope", "hold"), { ...first, ran: false }, answer("scope", "ok", 1)]) {
    const result = prGuardVerdict({ required: ["scope"], answers: [first, second] });

    assert.deepEqual(result, {
      verdict: "stop",
      reasons: [{ name: "scope", reason: "conflicting answers" }],
    });
    assert.deepEqual(prGuardVerdict({ required: ["scope"], answers: [second, first] }), result);
  }
});

test("counts identical answers once", () => {
  const checked = answer("scope");
  const input = { required: ["scope"], answers: [checked] };

  assert.deepEqual(prGuardVerdict({ ...input, answers: [checked, { ...checked }] }), prGuardVerdict(input));
});

test("stops when the required list is empty", () => {
  for (const answers of [[], [answer("scope")]]) {
    assert.deepEqual(prGuardVerdict({ required: [], answers }), {
      verdict: "stop",
      reasons: [{ reason: "no required guards" }],
    });
  }
});

test("an extra guard can stop the PR", () => {
  const result = prGuardVerdict({
    required: ["scope"],
    answers: [answer("scope"), answer("lockfile", "stop", 1)],
  });

  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.reasons[0], { name: "lockfile", reason: "guard stopped", findings: 1 });
});

test("an optional guard can be skipped when it reports no issue", () => {
  const input = { required: ["scope"], answers: [answer("scope")] };
  const skipped = { ...answer("lockfile"), ran: false };

  assert.deepEqual(prGuardVerdict({ ...input, answers: [...input.answers, skipped] }), prGuardVerdict(input));
});

test("an ok verdict with findings stops the PR and reports only the count", () => {
  const result = prGuardVerdict({
    required: ["secrets"],
    answers: [{ ...answer("secrets", "ok", 1), details: ["example finding text"] }],
  });

  assert.deepEqual(result, {
    verdict: "stop",
    reasons: [{ name: "secrets", reason: "ok with findings", findings: 1 }],
  });
});

test("malformed input stops with a plain reason", () => {
  for (const input of [undefined, null, "scope", [], {}, { required: ["scope"], answers: null }]) {
    assert.deepEqual(prGuardVerdict(input), {
      verdict: "stop",
      reasons: [{ reason: "invalid guard input" }],
    });
  }
  for (const required of [[null], [" "], new Array(1)]) {
    assert.deepEqual(prGuardVerdict({ required, answers: [] }), {
      verdict: "stop",
      reasons: [{ reason: "invalid required guard name" }],
    });
  }
  for (const malformed of [null, {}, { ...answer("scope"), name: "" }]) {
    assert.deepEqual(prGuardVerdict({ required: ["scope"], answers: [answer("scope"), malformed] }), {
      verdict: "stop",
      reasons: [{ reason: "invalid guard answer" }, { name: "scope", reason: "ok", findings: 0 }],
    });
  }
  for (const malformed of [
    { ...answer("scope"), ran: "yes" },
    { name: "scope", ran: true, verdict: "ok" },
    ...[-1, 0.5, NaN, Infinity, "0"].map((findings) => ({ ...answer("scope"), findings })),
  ]) {
    const result = prGuardVerdict({ required: ["scope"], answers: [malformed] });

    assert.equal(result.verdict, "stop");
    assert.equal(result.reasons[0].name, "scope");
    assert.match(result.reasons[0].reason, /^invalid /);
  }
});

test("reports reasons by guard name and leaves the input intact", () => {
  const required = Object.freeze(["tests-first", "secrets", "dependencies", "lockfile"]);
  const answers = Object.freeze([
    Object.freeze(answer("secrets", "stop", 2)),
    Object.freeze(answer("dependencies", "hold", 1)),
    Object.freeze(answer("lockfile")),
  ]);
  const input = Object.freeze({ required, answers });
  const result = prGuardVerdict(input);

  assert.deepEqual(result.reasons.map(({ name }) => name), ["dependencies", "lockfile", "secrets", "tests-first"]);
  assert.deepEqual(prGuardVerdict(input), result);
  assert.deepEqual(prGuardVerdict({ required: [...required].reverse(), answers: [...answers].reverse() }), result);
});
