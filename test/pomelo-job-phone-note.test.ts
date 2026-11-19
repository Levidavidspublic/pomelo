import assert from "node:assert/strict";
import test from "node:test";
import { jobPhoneNote, type JobNoteInput } from "../src/pomelo/browser/job-phone-note.js";

const job: JobNoteInput = {
  id: "job-1",
  threadId: "thread-1",
  laneId: "lane-1",
  state: "done",
  threadTitle: "Research",
  result: "Found three options.",
  ranOnVps: true,
};

test("a finished VPS job points the phone at its thread and lane", () => {
  assert.deepEqual(jobPhoneNote(job, []), {
    title: "Research",
    body: "Done on the VPS: Found three options.",
    sid: "thread-1",
    kind: "done",
    lane: "lane-1",
  });
});

test("a finished PC job uses local wording", () => {
  assert.equal(jobPhoneNote({ ...job, ranOnVps: false }, [])?.body, "Done: Found three options.");
});

test("a failed job says what failed and masks the result", () => {
  const marker = "failure-fixture";
  const note = jobPhoneNote({ ...job, state: "failed", result: `Could not load ${marker}.` }, [marker]);
  assert.equal(note?.body, "Failed on the VPS: Could not load ••••.");
  assert.equal(note?.kind, "stopped");
});

test("a waiting job shows fixed wording for each hold reason", () => {
  const holds = [
    ["1password-locked", "Waiting for you: unlock 1Password"],
    ["vps-unreachable", "Waiting for you: the VPS is unreachable"],
    ["captcha", "Waiting for you: complete the CAPTCHA"],
    ["budget", "Waiting for you: review the job budget"],
    [undefined, "Waiting for you: check the browser job"],
  ] as const;
  for (const [holdReason, body] of holds) {
    assert.deepEqual(jobPhoneNote({ ...job, state: "waiting", holdReason }, []), {
      title: "Research", body, sid: "thread-1", kind: "question", lane: "lane-1",
    });
  }
});

test("queued, running and cancelled jobs give no note", () => {
  for (const state of ["queued", "running", "cancelled"] as const) {
    assert.equal(jobPhoneNote({ ...job, state }, []), null);
  }
});

test("the serialized note hides the canary in the title, result and encoded URL path", () => {
  const canary = "phone fixture/+sample";
  const encoded = encodeURIComponent(canary);
  const note = jobPhoneNote({
    ...job,
    threadTitle: `Research ${canary}`,
    result: `Found ${canary} at https://site.example/${encoded}?item=${encoded}`,
  }, [canary]);
  assert.ok(note);
  const payload = JSON.stringify(note);
  assert.ok(!payload.includes(canary));
  assert.ok(!payload.includes(encoded));
  assert.equal(note.title, "Research ••••");
  assert.equal(note.body, "Done on the VPS: Found •••• at https://site.example/••••");
});

test("URLs in the title and result keep their host and path and lose their query", () => {
  const note = jobPhoneNote({
    ...job,
    threadTitle: "From <https://site.example/topic?view=detail>",
    result: "Opened https://site.example/path?token=abc and https://site.example/next?view=short#item",
  }, []);
  assert.equal(note?.title, "From <https://site.example/topic>");
  assert.equal(note?.body, "Done on the VPS: Opened https://site.example/path and https://site.example/next#item");
});

test("quotes inside query values do not expose the rest of the query", () => {
  for (const quote of ["'", '"', "`"]) {
    const link = `https://site.example/p?name=o${quote}brien&token=abc`;
    const note = jobPhoneNote({ ...job, threadTitle: `From <${link}>`, result: `Opened ${link} twice` }, []);
    assert.equal(note?.title, "From <https://site.example/p>");
    assert.equal(note?.body, "Done on the VPS: Opened https://site.example/p twice");
  }
});

test("bare hosts and relative paths lose their query too", () => {
  const note = jobPhoneNote({
    ...job,
    threadTitle: "From site.example/path?token=abc",
    result: "Opened /cb?code=abc then ../docs/intro?raw and callback?code=abc",
  }, []);
  assert.equal(note?.title, "From site.example/path");
  assert.equal(note?.body, "Done on the VPS: Opened /cb then ../docs/intro and callback");
});

test("a secret spanning a URL's question mark cannot expose the remaining query", () => {
  const marker = "?first=fixture";
  const note = jobPhoneNote({ ...job, result: `https://site.example/path${marker}&second=detail?extra` }, [marker]);
  assert.equal(note?.body, "Done on the VPS: ••••");
});

test("vault references and cookie headers stay out of the note", () => {
  const note = jobPhoneNote({
    ...job,
    threadTitle: 'Reference "op://Demo Vault/Example/field"',
    result: "Found a header: Set-Cookie: sample=fixture; Path=/",
  }, []);
  assert.equal(note?.title, 'Reference "••••"');
  assert.equal(note?.body, "Done on the VPS: Found a header: Set-Cookie: ••••");
});

test("the title and body are capped after masking", () => {
  const marker = "boundary-fixture";
  const title = "a".repeat(116);
  const result = "b".repeat(219);
  const note = jobPhoneNote({
    ...job,
    threadTitle: title + marker,
    result: (result + marker).padEnd(600, "c"),
  }, [marker]);
  assert.equal(note?.title, title + "••••");
  assert.equal(note?.body, `Done on the VPS: ${result}••••`);
  assert.equal(note?.title.length, 120);
  assert.equal(note?.body.length, 240);
});

test("an empty title falls back to Pomelo", () => {
  assert.equal(jobPhoneNote({ ...job, threadTitle: "" }, [])?.title, "Pomelo");
});
