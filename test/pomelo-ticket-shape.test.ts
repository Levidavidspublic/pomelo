import assert from "node:assert/strict";
import test from "node:test";
import { checkTicketShape } from "../src/pomelo/ticket-shape.js";

const ticket = {
  key: "P0-27",
  title: "Check the ticket shape before work starts",
  phase: 0,
  when: ["#4", "#75"],
  scope: "`src/pomelo/one.ts` `src/pomelo/two.ts` `src/client/pomelo/three.ts` `test/pomelo-ticket-shape.test.ts`",
  steps: ["code-map: read the existing scope check", "Write the test"],
  done: "npm test -- test/pomelo-ticket-shape.test.ts -> all tests pass",
  needs_amit: false,
};

function assertProblem(input: unknown, problem: RegExp): void {
  const result = checkTicketShape(input);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((message) => problem.test(message)), result.problems.join("\n"));
}

test("a ticket with three code files and one matching test passes", () => {
  assert.deepEqual(checkTicketShape(ticket), { ok: true, problems: [] });
});

test("DONE can quote the command and append npm run typecheck", () => {
  const done = "`npm test -- test/pomelo-ticket-shape.test.ts` -> all tests pass && npm run typecheck";
  assert.deepEqual(checkTicketShape({ ...ticket, done }), { ok: true, problems: [] });
});

test("DONE requires a named test command and a nonempty expected result", () => {
  for (const done of ["npm test", "npm test -- test/pomelo-ticket-shape.test.ts -> "]) {
    assertProblem({ ...ticket, done }, /DONE/);
  }
});

test("DONE rejects extra commands and a second test file", () => {
  for (const done of [
    `${ticket.done} && npm test -- test/other.test.ts`,
    `${ticket.done} && npm run typecheck && npm run lint`,
    `${ticket.done} && npm run lint`,
    `${ticket.done}; npm run typecheck`,
    ticket.done.replace(" ->", " test/other.test.ts ->"),
    `${ticket.done} for test/other.test.ts`,
  ]) {
    assertProblem({ ...ticket, done }, /DONE/);
  }
});

test("SCOPE requires backticked paths", () => {
  assertProblem({ ...ticket, scope: "src/pomelo/one.ts test/pomelo-ticket-shape.test.ts" }, /SCOPE.*backtick/);
  assertProblem({ ...ticket, scope: "` `" }, /SCOPE.*backtick/);
});

test("SCOPE allows at most three code files", () => {
  assertProblem({ ...ticket, scope: `${ticket.scope} \`src/pomelo/four.ts\`` }, /SCOPE.*at most 3.*four\.ts/);
});

test("SCOPE allows at most one test file", () => {
  assertProblem({ ...ticket, scope: `${ticket.scope} \`test/other.test.ts\`` }, /SCOPE.*at most 1.*other\.test\.ts/);
});

test("the DONE test must be listed in SCOPE", () => {
  const done = "npm test -- test/other.test.ts -> all tests pass";
  assertProblem({ ...ticket, done }, /DONE.*test\/other\.test\.ts.*SCOPE/);
  assertProblem({ ...ticket, scope: "`src/pomelo/one.ts`" }, /DONE.*test\/pomelo-ticket-shape\.test\.ts.*SCOPE/);
});

test("a .github path requires needs_amit to be true even with PATCHES.md", () => {
  const scope = "`.github/workflows/scope check.yml` `PATCHES.md` `test/pomelo-ticket-shape.test.ts`";
  assertProblem({ ...ticket, scope }, /\.github\/workflows\/scope check\.yml.*needs_amit/);
  assertProblem({ ...ticket, scope, needs_amit: "true" }, /\.github\/workflows\/scope check\.yml.*needs_amit/);
});

test("a Friday file in SCOPE requires PATCHES.md, which counts as a code file", () => {
  const scope = "`src/agent-mesh.ts` `src/client/pomelo/view.ts` `test/pomelo-ticket-shape.test.ts`";
  assertProblem({ ...ticket, scope }, /src\/agent-mesh\.ts.*PATCHES\.md/);

  const patchedScope = `${scope} \`PATCHES.md\``;
  assert.deepEqual(checkTicketShape({ ...ticket, scope: patchedScope }), { ok: true, problems: [] });
  assertProblem({ ...ticket, scope: `${patchedScope} \`src/pomelo/four.ts\`` }, /SCOPE.*at most 3/);
});

test("the first step must start with code-map:", () => {
  assertProblem({ ...ticket, steps: ["Write the test", ticket.steps[0]] }, /STEPS.*code-map:/i);
});

test("WHEN must be a list of issue references", () => {
  for (const when of ["#4", ["4"], ["#4", "#no"], [4]]) {
    assertProblem({ ...ticket, when }, /WHEN.*#<number>/i);
  }
});

test("needs_amit skips the SCOPE file limits and folder checks", () => {
  const scope = `${ticket.scope} \`.github/workflows/check.yml\` \`src/agent-mesh.ts\` \`test/other.test.ts\``;
  assert.deepEqual(checkTicketShape({ ...ticket, scope, needs_amit: true }), { ok: true, problems: [] });
});

test("needs_amit still requires a title, phase and steps", () => {
  const input = { ...ticket, needs_amit: true, title: "", phase: undefined, steps: [] };
  assertProblem(input, /title/i);
  assertProblem(input, /phase/i);
  assertProblem(input, /steps/i);
});

test("missing or unknown fields and malformed input return problems", () => {
  for (const input of [undefined, null, 172, []]) {
    assertProblem(input, /ticket.*object/i);
  }

  for (const field of Object.keys(ticket)) {
    const input: Record<string, unknown> = { ...ticket };
    delete input[field];
    assertProblem(input, new RegExp(`\\b${field}\\b`, "i"));
  }

  assertProblem({ ...ticket, unexpected: true }, /unexpected/);
  assertProblem({ ...ticket, steps: [ticket.steps[0], null] }, /steps/i);
});
