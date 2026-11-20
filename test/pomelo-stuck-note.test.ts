import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStuckNote } from "../src/pomelo/stuck-note.js";

const ticket = Object.freeze({ number: 517, key: "P0-84", title: "Stuck-ticket note" });
const attempts = Object.freeze([
  Object.freeze({ step: "test", firstErrorLine: "  Expected two rows.  \r\nStack trace follows." }),
  Object.freeze({ step: "typecheck", firstErrorLine: "The return type differs." }),
  Object.freeze({ step: "review", firstErrorLine: "The note needs a verdict." }),
] as const);

test("the verdict comes first, followed by the three attempts in order and one next step", () => {
  const note = buildStuckNote(ticket, attempts, [{ number: 518, key: "P0-85" }]);

  assert.equal(note.title, ticket.title);
  assert.deepEqual(note.lines, [
    "#517 P0-84 is stuck after 3 attempts",
    "Attempt 1 (test) — Expected two rows.",
    "Attempt 2 (typecheck) — The return type differs.",
    "Attempt 3 (review) — The note needs a verdict.",
    "Waiting on it — #518 P0-85",
    "Next step — Hand the ticket to Amit.",
  ]);
});

test("a ticket with fewer than three attempts is not stuck yet", () => {
  for (const count of [0, 1, 2]) {
    const note = buildStuckNote(ticket, attempts.slice(0, count), [{ number: 518, key: "P0-85" }]);
    assert.deepEqual(note.lines, ["#517 P0-84 is not stuck yet"]);
  }
});

test("a token canary is hidden even when the error contains terminal controls", () => {
  const canary = ["gh", "p_", "AB12".repeat(9)].join("");
  const decorated = `${canary.slice(0, 5)}\u001b[31m${canary.slice(5)}\u001b[0m`;
  const note = buildStuckNote({ ...ticket, title: `Rejected ${canary}` }, [
    { step: "merge conflict", firstErrorLine: ` Rejected\u0000 ${decorated}\u007f\nExtra details.` },
    ...attempts.slice(1),
  ], []);

  assert.equal(note.title, "Rejected [hidden]");
  assert.equal(note.lines[1], "Attempt 1 (merge conflict) — Rejected [hidden]");
});

test("the note hides short and quoted credentials", () => {
  const note = buildStuckNote(ticket, [
    { step: "timeout", firstErrorLine: 'Auth failed with password="two words" and signing_key=demo.' },
    { step: "test", firstErrorLine: 'Request used Authorization: Bearer demo and "api_key": "sample"' },
    attempts[2],
  ], []);

  assert.equal(note.lines[1], "Attempt 1 (timeout) — Auth failed with password=[hidden] and signing_key=[hidden]");
  assert.equal(note.lines[2], 'Attempt 2 (test) — Request used Authorization: Bearer [hidden] and "api_key": [hidden]');
});

test("a long error is cut to 160 characters including the ellipsis", () => {
  const note = buildStuckNote(ticket, [
    { step: "test", firstErrorLine: "x".repeat(5_000) },
    ...attempts.slice(1),
  ], []);

  assert.equal(note.lines[1], `Attempt 1 (test) — ${"x".repeat(159)}…`);
});

test("an excerpt hides the whole token before applying the length limit", () => {
  const canary = ["gh", "p_", "AB12".repeat(9)].join("");
  const prefix = "x".repeat(150);
  const note = buildStuckNote(ticket, [
    { step: "test", firstErrorLine: `${prefix} ${canary} Extra details.` },
    ...attempts.slice(1),
  ], []);

  assert.equal(note.lines[1], `Attempt 1 (test) — ${prefix} [hidden]…`);
});

test("an empty dependant list says nothing is waiting on it", () => {
  const note = buildStuckNote(ticket, attempts, []);
  assert.equal(note.lines[4], "Nothing is waiting on it.");
});

test("dependants are listed by ascending ticket number without changing the input", () => {
  const dependants = Object.freeze([
    Object.freeze({ number: 105, key: "P0-19" }),
    Object.freeze({ number: 8, key: "P0-05" }),
    Object.freeze({ number: 20, key: "P0-08" }),
  ]);
  const note = buildStuckNote(ticket, attempts, dependants);

  assert.equal(note.lines[4], "Waiting on it — #8 P0-05, #20 P0-08, #105 P0-19");
  assert.deepEqual(dependants.map(({ number }) => number), [105, 8, 20]);
});

test("the note keeps the full Hebrew title and gives the same result for the same input", () => {
  const hebrewTicket = { ...ticket, title: "הַמְשִׂימָה נִתְקְעָה לאחר שלושה ניסיונות ".repeat(8).trimEnd() };
  const note = buildStuckNote(hebrewTicket, attempts, []);

  assert.equal(note.title, hebrewTicket.title);
  assert.deepEqual(buildStuckNote(hebrewTicket, attempts, []), note);
});
