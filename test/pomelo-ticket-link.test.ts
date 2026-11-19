import assert from "node:assert/strict";
import test from "node:test";
import { checkTicketLink } from "../src/pomelo/ticket-link.js";

const matching = {
  branch: "ticket/75-p0-13",
  title: "P0-13 Add a ticket link",
  body: "## What this changes\n\nAdds a ticket link.\n\nCloses #75\n",
};

test("the branch, title and closing line link to the same ticket", () => {
  assert.deepEqual(checkTicketLink(matching), {
    ok: true,
    issue: 75,
    key: "P0-13",
    problems: [],
  });
});

test("the branch must follow the lowercase ticket format", () => {
  for (const branch of ["feature/75-p0-13", "ticket/75-P0-13", "ticket/75-p0-13-extra"]) {
    assert.deepEqual(checkTicketLink({ ...matching, branch }), {
      ok: false,
      issue: null,
      key: null,
      problems: ["The branch must use the format ticket/<issue>-p<phase>-<ticket>."],
    });
  }
});

test("the title must start with the complete matching key", () => {
  for (const title of ["P0-14 Add a ticket link", "P0-130 Add a ticket link"]) {
    assert.deepEqual(checkTicketLink({ ...matching, title }), {
      ok: false,
      issue: 75,
      key: "P0-13",
      problems: ["The title must start with P0-13 to match the branch."],
    });
  }
  assert.deepEqual(checkTicketLink({ ...matching, title: "p0-13 Add a ticket link" }).problems, [
    "The title must start with an uppercase ticket key such as P0-13.",
  ]);
});

test("the closing line must name the branch issue", () => {
  assert.deepEqual(checkTicketLink({ ...matching, body: "Closes #76" }).problems, [
    "The body must close issue #75 to match the branch.",
  ]);
  assert.equal(checkTicketLink({ ...matching, branch: "ticket/9007199254740992-p0-13", body: "Closes #9007199254740993" }).ok, false);
});

test("two closing references fail even if both name the same issue", () => {
  for (const body of ["Closes #75\nFixes #76", "Closes #75\nResolves #75", "Closes #75 and fixes #76"]) {
    assert.deepEqual(checkTicketLink({ ...matching, body }).problems, [
      "The body must contain exactly one closing reference.",
    ]);
  }
});

test("a PR body needs a dedicated closing line", () => {
  for (const body of ["Adds a ticket link.", "This PR closes #75.", "Closes #75, #76"]) {
    assert.deepEqual(checkTicketLink({ ...matching, body }).problems, [
      "The body must contain a closing line such as Closes #75.",
    ]);
  }
});

test("closing words accept mixed case and Windows line endings", () => {
  for (const word of ["cLoSeS", "FIXES", "resolves"]) {
    assert.equal(checkTicketLink({ ...matching, body: `Adds a ticket link.\r\n\r\n${word} #75\r\n` }).ok, true);
  }
});

test("issue mentions without a closing word do not count", () => {
  const body = "See also #75 and #76.";
  assert.equal(checkTicketLink({ ...matching, body: `${body}\n\nCloses #75` }).ok, true);
  assert.deepEqual(checkTicketLink({ ...matching, body }).problems, [
    "The body must contain a closing line such as Closes #75.",
  ]);
});

test("empty strings return problems in branch, title and body order", () => {
  assert.deepEqual(checkTicketLink({ branch: "", title: "", body: "" }), {
    ok: false,
    issue: null,
    key: null,
    problems: [
      "The branch must use the format ticket/<issue>-p<phase>-<ticket>.",
      "The title must start with an uppercase ticket key such as P0-13.",
      "The body must contain a closing line such as Closes #75.",
    ],
  });
});
