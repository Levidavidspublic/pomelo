import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloVaultSettings } from "../src/client/pomelo/PomeloVaultSettings.js";
import { vaultSettings } from "../src/client/pomelo/vault-settings.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";

const now = 2_000;
const link = { provider: "1password", account: "Example account", vault: "Example vault", status: "SET" };
const reference = {
  id: "sample-reference",
  opRef: "op://Demo/Calendar/sample-field",
  field: "sample-field",
  allowedOrigins: ["https://calendar.example.test", "https://work.example.test:8443"],
};

function render(rawLink: unknown, refs: unknown = []) {
  return renderToStaticMarkup(createElement(PomeloVaultSettings, {
    settings: vaultSettings({ link: rawLink, refs, now }),
  }));
}

test("the 1Password link shows each status word and its plain label", () => {
  for (const [status, label] of [["SET", "Linked"], ["UNSET", "Not linked"], ["LOCKED", "Locked"]]) {
    const html = render({ ...link, status });
    assert.match(html, new RegExp(`>${status}<[^>]+>\\s*<[^>]+>${label}<`));
    if (status !== "LOCKED") assert.doesNotMatch(html, /Unlock 1Password on this computer/);
  }
});

test("a locked link gives the desktop unlock instruction without a button", () => {
  const html = render({ ...link, status: "LOCKED" });

  assert.match(html, />Unlock 1Password on this computer\.</);
  assert.doesNotMatch(html, /<button\b/i);
});

test("saved references each show their label and their own allowed sites", () => {
  const html = render(link, [
    reference,
    { ...reference, id: "sample-inbox", opRef: "op://Demo/Inbox/sample-field", allowedOrigins: ["https://inbox.example.test"] },
  ]);

  assert.match(html, /<ul\b/);
  const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  assert.equal(rows.length, 2);
  assert.match(rows[0], />Demo \/ Calendar</);
  assert.match(rows[0], />calendar\.example\.test, work\.example\.test:8443</);
  assert.match(rows[1], />Demo \/ Inbox</);
  assert.match(rows[1], />inbox\.example\.test</);
});

test("an empty reference list shows a plain empty message", () => {
  const html = render(undefined);

  assert.match(html, />No saved references\.</);
  assert.doesNotMatch(html, /<li\b/);
});

test("a Hebrew reference label reads right to left and its sites read left to right", () => {
  const html = render(link, [{ ...reference, opRef: "op://Demo/לוח-שנה/sample-field" }]);

  assert.match(html, /<li\b[^>]*\bdir="rtl"[^>]*>[\s\S]*>Demo \/ לוח-שנה</);
  assert.match(html, /<[^>]+\bdir="ltr"[^>]*>calendar\.example\.test, work\.example\.test:8443</);
});

test("the vault view keeps canaries, reference paths and password entry out of the markup", () => {
  const canary = "fixture-canary+value=42";
  const extra = { value: canary, extra: encodeURIComponent(canary) };
  const html = render({ ...link, ...extra }, [{
    ...reference,
    ...extra,
    opRef: `op://Demo/Calendar/${canary}`,
  }]);

  assert.match(html, />Demo \/ Calendar</);
  assertNoCanary(canary, { markup: html });
  assert.doesNotMatch(html, /op:\/\/|<input\b|<form\b/i);
  assert.doesNotMatch(html, /Example account|Example vault|sample-reference|sample-field|>active</);
});
