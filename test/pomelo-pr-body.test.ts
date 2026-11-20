import assert from "node:assert/strict";
import test from "node:test";
import { checkPrBody } from "../src/pomelo/pr-body.js";

const command = "npm test -- test/pomelo-pr-body.test.ts && npm run typecheck";
const counts = ["# tests 3", "# pass 3", "# fail 0"];

function bodyWith(result = counts): string {
  return [
    "Adds a PR body check.",
    `DONE: \`${command}\``,
    "```text",
    ...result,
    "```",
    "Closes #697",
  ].join("\n");
}

function problems(body: string) {
  const verdict = checkPrBody(body, command);
  assert.equal(verdict.ok, false);
  return verdict.problems.map(({ code, line }) => ({ code, line }));
}

test("a complete PR body passes", () => {
  assert.deepEqual(checkPrBody(bodyWith(), command), { ok: true, problems: [] });
});

test("a whitespace-only body reports that it is empty", () => {
  assert.deepEqual(problems(" \r\n\t"), [{ code: "empty-body", line: undefined }]);
});

test("the body needs the exact DONE command", () => {
  for (const replacement of ["npm test", `${command}-other`, `${command} && echo done`]) {
    assert.deepEqual(problems(bodyWith().replace(command, replacement)), [
      { code: "missing-done-command", line: undefined },
    ]);
  }
});

test("the command needs a closed fenced result with test counts after it", () => {
  for (const lines of [
    counts,
    ["```text", "The tests passed.", "```"],
    ["```text", ...counts, "~~~"],
    ["```text", ...counts.slice(0, 2), "```"],
  ]) {
    assert.deepEqual(problems(["Summary", command, ...lines].join("\n")), [
      { code: "missing-done-result", line: 2 },
      { code: "missing-closing-line", line: undefined },
    ]);
  }
  assert.deepEqual(problems(["```text", ...counts, "```", command, "Closes #697"].join("\n")), [
    { code: "missing-done-result", line: 6 },
  ]);
});

test("the failure count supplies the diagnostic line", () => {
  assert.deepEqual(problems(bodyWith(["# tests 3", "# pass 2", "# fail 1"])), [
    { code: "failed-tests", line: 6 },
  ]);
});

test("a later passing summary cannot hide an earlier failure", () => {
  assert.deepEqual(problems(bodyWith(["# tests 3", "# pass 2", "# fail 1", ...counts])), [
    { code: "failed-tests", line: 6 },
  ]);
});

test("a result with zero tests supplies the diagnostic line", () => {
  assert.deepEqual(problems(bodyWith(["# tests 0", "# pass 0", "# fail 0"])), [
    { code: "zero-tests", line: 4 },
  ]);
});

test("a result with zero passing tests cannot prove a green run", () => {
  assert.deepEqual(problems(bodyWith(["# tests 3", "# pass 0", "# fail 0", "# skipped 3"])), [
    { code: "zero-tests", line: 5 },
  ]);
});

test("a closing line needs to appear in the body outside the pasted result and comments", () => {
  const body = bodyWith([...counts, "Closes #697"]).replace(/Closes #697$/, "<!--\nCloses #697\n-->");
  assert.deepEqual(problems(body), [{ code: "missing-closing-line", line: undefined }]);
});

test("a second closing line is reported even if the ticket number is the same", () => {
  assert.deepEqual(problems(`${bodyWith()}\nCloses #697`), [
    { code: "multiple-closing-lines", line: 9 },
  ]);
});

test("leftover template placeholders are reported without repeating body content", () => {
  const body = `${bodyWith()}\n<paste output here>\n<!-- Tests you added or ran, and what you tried by hand. -->`;
  const verdict = checkPrBody(body, command);
  assert.deepEqual(problems(body), [
    { code: "template-placeholder", line: 9 },
    { code: "template-placeholder", line: 10 },
  ]);
  assert.ok(!JSON.stringify(verdict).includes("paste output here"));
});

test("a Hebrew summary and Windows line endings pass", () => {
  const body = bodyWith().replace("Adds a PR body check.", "נוספה בדיקה לתיאור הבקשה.").replaceAll("\n", "\r\n");
  assert.deepEqual(checkPrBody(body, command), { ok: true, problems: [] });
});

test("a pasted shell transcript can include the command and the spec reporter summary", () => {
  const body = ["~~~console", `$ ${command}`, "\x1b[34mℹ tests 3\x1b[0m", "ℹ pass 3", "ℹ fail 0", "~~~", "Closes #697"].join("\n");
  assert.deepEqual(checkPrBody(body, command), { ok: true, problems: [] });
});

test("a placeholder inside an output fence and a hidden DONE command are reported", () => {
  const body = bodyWith(["<paste output here>"]).replace(`DONE: \`${command}\``, `<!--\n${command}\n-->`);
  assert.deepEqual(problems(body), [
    { code: "missing-done-command", line: undefined },
    { code: "template-placeholder", line: 6 },
  ]);
});

test("problems use rule order and 1-based line numbers", () => {
  const body = ["<paste output here>", "Closes #697", "Closes #698", command, "```", "# tests 0", "# fail 1", "```"].join("\n");
  assert.deepEqual(problems(body), [
    { code: "failed-tests", line: 7 },
    { code: "zero-tests", line: 6 },
    { code: "multiple-closing-lines", line: 3 },
    { code: "template-placeholder", line: 1 },
  ]);
});
