import assert from "node:assert/strict";
import { test } from "node:test";
import { runNote, type RunNoteFacts, type RunNoteTicket } from "../src/pomelo/run-note.js";

const clearFacts: RunNoteFacts = Object.freeze({ pauseFilePresent: false, uncappedPaidTool: false });

function ticket(number: number, state: string, title = `Ticket ${number}`, needsAmit = false): RunNoteTicket {
  return { number, key: `P0-${number}`, title, state, needsAmit };
}

test("an empty run is all clear with zero counts and no action", () => {
  assert.deepEqual(runNote([], clearFacts), {
    verdict: "all clear",
    counts: { new: 0, running: 0, pr_open: 0, done: 0, stuck: 0, held: 0, unknown: 0 },
    needsYou: [],
    moreNeedsYou: 0,
    nextAction: "No action needed.",
  });
});

test("every ticket is counted in its own state", () => {
  const tickets = [
    ticket(1, "new"), ticket(2, "running"), ticket(3, "pr_open"), ticket(4, "done"),
    ticket(5, "done"), ticket(6, "stuck"), ticket(7, "held"),
  ];
  assert.deepEqual(runNote(tickets, clearFacts).counts, {
    new: 1, running: 1, pr_open: 1, done: 2, stuck: 1, held: 1, unknown: 0,
  });
});

test("the pause file wins even with uncapped spend and tickets waiting", () => {
  const note = runNote([ticket(2, "held")], { pauseFilePresent: true, uncappedPaidTool: true });
  assert.equal(note.verdict, "paused");
  assert.match(note.nextAction, /pause file/);
  assert.deepEqual(note.needsYou, ["#2 Ticket 2 (held for you)"]);
});

test("uncapped paid tools block a run even when a ticket is stuck", () => {
  const note = runNote([ticket(2, "stuck")], { ...clearFacts, uncappedPaidTool: true });
  assert.equal(note.verdict, "blocked");
  assert.match(note.nextAction, /Cap or switch off/);
});

test("stuck and held tickets are listed by number, and the next action points to the one asking for input", () => {
  const note = runNote([
    ticket(10, "held", "Review the settings", true),
    ticket(1, "running", "Working", true),
    ticket(2, "stuck", "Check the report"),
  ], clearFacts);
  assert.equal(note.verdict, "needs you");
  assert.deepEqual(note.needsYou, ["#2 Check the report (stuck)", "#10 Review the settings (held for you)"]);
  assert.equal(note.nextAction, "Give your input on ticket #10 first.");
  assert.equal(runNote([ticket(2, "stuck")], clearFacts).nextAction, "Review ticket #2 first.");
  assert.equal(runNote([ticket(1, "running", "Working", true)], clearFacts).verdict, "all clear");
});

test("the note shows only five tickets and counts the rest", () => {
  const tickets = [10, 8, 6, 4, 2, 12, 1].map((number) => ticket(number, "stuck"));
  const note = runNote(tickets, clearFacts);
  assert.deepEqual(note.needsYou, [1, 2, 4, 6, 8].map((number) => `#${number} Ticket ${number} (stuck)`));
  assert.equal(note.moreNeedsYou, 2);
  assert.equal(runNote(tickets.slice(0, 5), clearFacts).moreNeedsYou, 0);
});

test("long titles end on a whole word with an ellipsis", () => {
  const title = "Review the kitchen status and ".repeat(4).trim();
  assert.deepEqual(runNote([ticket(3, "held", title)], clearFacts).needsYou, [
    "#3 Review the kitchen status and Review the kitchen status and Review the kitchen… (held for you)",
  ]);
  assert.deepEqual(runNote([ticket(3, "held", "x".repeat(100))], clearFacts).needsYou, ["#3 … (held for you)"]);
});

test("Hebrew titles and combining marks stay whole", () => {
  const title = "בְּדִיקַת תּוֹצָאוֹת";
  assert.deepEqual(runNote([ticket(3, "held", title)], clearFacts).needsYou, [`#3 ${title} (held for you)`]);

  const prefix = title + " א".repeat(28);
  const longTitle = `${prefix} בְּדִיקַת תּוֹצָאוֹת`;
  assert.deepEqual(runNote([ticket(3, "held", longTitle)], clearFacts).needsYou, [
    `#3 ${prefix}… (held for you)`,
  ]);
});

test("control characters are removed and whitespace becomes a single line", () => {
  const title = "  Re\u0000view\t\u001b the\r\n\u202ekit\u0080chen\u2069  ";
  assert.deepEqual(runNote([ticket(5, "stuck", title)], clearFacts).needsYou, ["#5 Review the kitchen (stuck)"]);
});

test("unrecognized states are counted as unknown", () => {
  const note = runNote([ticket(1, "constructor"), ticket(2, "reopened"), ticket(3, "done")], clearFacts);
  assert.equal(note.counts.unknown, 2);
  assert.equal(note.counts.done, 1);
  assert.equal(note.verdict, "all clear");
  assert.deepEqual(note.needsYou, []);
});

test("the same input produces the same note without changing the input", () => {
  const tickets = Object.freeze([Object.freeze(ticket(10, "held")), Object.freeze(ticket(2, "stuck"))]);
  assert.deepEqual(runNote(tickets, clearFacts), runNote(tickets, clearFacts));
  assert.deepEqual(tickets.map(({ number }) => number), [10, 2]);
});
