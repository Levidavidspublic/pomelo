import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloHeldJobCard, type PomeloHeldJobCardProps } from "../src/client/pomelo/PomeloHeldJobCard.js";

const vaultLocked = {
  kind: "goahead",
  title: "Unlock 1Password",
  note: "Job job-42 is waiting for the vault to unlock.",
  commands: ["Continue the browser job after unlocking 1Password"],
  approve: "I unlocked it",
  wait: true,
};

const cloudUnreachable = {
  kind: "choices",
  title: "VPS not reachable",
  note: "Job job-42 is waiting for the cloud browser.",
  options: [{ label: "Retry" }, { label: "Cancel job" }],
  wait: true,
};

const partialImport = {
  kind: "table",
  title: "Partial import",
  note: "Job job-42",
  columns: ["Site", "Result"],
  rows: [["one.example", "imported"], ["two.example", "expired"]],
};

const unknown = {
  kind: "table",
  title: "Job is waiting",
  columns: ["Job"],
  rows: [["job-42"]],
};

function render(card: PomeloHeldJobCardProps["card"]) {
  const onAnswer = () => assert.fail("Rendering must not answer a job");
  const html = renderToStaticMarkup(createElement(PomeloHeldJobCard, { card, onAnswer }));
  assert.match(html, /\brole="group"/);
  assert.match(html, /<[^>]+\brole="status"[^>]*>waiting for you<\//);
  assert.doesNotMatch(html, /\b(?:done|finished|autofocus)\b/i);
  return html;
}

function assertButtons(html: string, labels: string[]) {
  assert.equal([...html.matchAll(/<button\b/g)].length, labels.length);
  assert.deepEqual(
    Array.from(html.matchAll(/<button\b[^>]*\btype="button"[^>]*>([^<]*)<\/button>/g), ([, label]) => label),
    labels,
  );
}

test("a locked vault explains the wait and offers the supplied confirmation", () => {
  const html = render(vaultLocked);
  assert.match(html, /aria-label="Unlock 1Password"/);
  assert.match(html, />Unlock 1Password</);
  assert.match(html, />Job job-42 is waiting for the vault to unlock\.</);
  assertButtons(html, ["I unlocked it"]);
  assert.doesNotMatch(html, /Continue the browser job after unlocking 1Password/);
});

test("an unreachable VPS explains the wait and offers retry and cancel", () => {
  const html = render(cloudUnreachable);
  assert.match(html, /aria-label="VPS not reachable"/);
  assert.match(html, />VPS not reachable</);
  assert.match(html, />Job job-42 is waiting for the cloud browser\.</);
  assertButtons(html, ["Retry", "Cancel job"]);
});

test("buttons use the labels supplied by the card", () => {
  const html = render({ ...cloudUnreachable, options: [{ label: "Try again" }] });
  assertButtons(html, ["Try again"]);
});

test("a partial import names each site and its result without offering an answer", () => {
  const html = render(partialImport);
  assert.match(html, /aria-label="Partial import"/);
  assert.match(html, />Partial import</);
  assert.match(html, />Job job-42</);
  assert.match(html, />one\.example<\/td><td\b[^>]*>imported<\/td>/);
  assert.match(html, />two\.example<\/td><td\b[^>]*>expired<\/td>/);
  assertButtons(html, []);
});

test("an empty answer list and an unknown reason offer no buttons", () => {
  assertButtons(render({ ...cloudUnreachable, options: [] }), []);
  assertButtons(render({ ...vaultLocked, approve: undefined }), []);

  const html = render(unknown);
  assert.match(html, /aria-label="Job is waiting"/);
  assert.match(html, />job-42</);
  assertButtons(html, []);
  assertButtons(render({ ...unknown, options: cloudUnreachable.options, approve: vaultLocked.approve }), []);
});

test("a Hebrew site name has right-to-left direction", () => {
  const html = render({ ...partialImport, rows: [["אתר לדוגמה", "expired"]] });
  assert.match(html, /<td\b[^>]*\bdir="rtl"[^>]*>אתר לדוגמה<\/td>/);
});

test("card text with markup characters is escaped", () => {
  const html = render({ ...partialImport, rows: [["<em>Site & name</em>", "expired"]] });
  assert.match(html, /&lt;em&gt;Site &amp; name&lt;\/em&gt;/);
  assert.doesNotMatch(html, /<em>/);
});
