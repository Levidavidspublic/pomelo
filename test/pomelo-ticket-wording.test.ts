import assert from "node:assert/strict";
import test from "node:test";
import { checkTicketWording } from "../src/pomelo/ticket-wording.js";

const routing = "tier: mid\ntrust: trusted";

test("a ticket with a tier and a trust level passes", () => {
  assert.deepEqual(checkTicketWording(`${routing}\nImprove the settings panel.`), { ok: true, hits: [] });
});

test("model names are reported once per line with their original spelling", () => {
  const ticket = `${routing}\n\nBuild this with Opus 5.5\nCodex GPT 6.2 Sol, high\nUse openai/gpt-6.2-sol or claude-sonnet-5-5.`;
  assert.deepEqual(checkTicketWording(ticket), {
    ok: false,
    hits: [
      { line: 4, word: "Opus", reason: "model-name" },
      { line: 5, word: "Codex GPT", reason: "model-name" },
      { line: 6, word: "gpt", reason: "model-name" },
    ],
  });
});

test("driver features are allowed, and assigning a driver to build the ticket is flagged", () => {
  const features = `${routing}\nthe Claude Code driver must not show a login form\nThe Codex driver should run with the saved settings.\nAdd OpenCode support.`;
  assert.deepEqual(checkTicketWording(features), { ok: true, hits: [] });
  const ticket = `${features}\nBuild this with the Codex driver.\nUpdate the OpenCode driver to use Gemini.\nWorker: OpenCode\nUse Claude Code to implement this task.\nUse Codex.`;
  assert.deepEqual(checkTicketWording(ticket), {
    ok: false,
    hits: [
      { line: 6, word: "Codex", reason: "model-name" },
      { line: 7, word: "Gemini", reason: "model-name" },
      { line: 8, word: "OpenCode", reason: "model-name" },
      { line: 9, word: "Claude Code", reason: "model-name" },
      { line: 10, word: "Codex", reason: "model-name" },
    ],
  });
});

test("missing tier and trust words are reported independently", () => {
  assert.deepEqual(checkTicketWording("trust: trusted\nA highlight in the UI."), {
    ok: false, hits: [{ line: 0, word: "", reason: "missing-tier" }],
  });
  assert.deepEqual(checkTicketWording("tier: mid\nShow untrustedness."), {
    ok: false, hits: [{ line: 0, word: "", reason: "missing-trust" }],
  });
});

test("custom tier and trust words replace the defaults and are matched literally", () => {
  const opts = { tiers: ["standard+"], trustLevels: ["reviewed"] };
  assert.deepEqual(checkTicketWording("tier: STANDARD+\ntrust: Reviewed", opts), { ok: true, hits: [] });
  assert.deepEqual(checkTicketWording(routing, opts), {
    ok: false,
    hits: [
      { line: 0, word: "", reason: "missing-tier" },
      { line: 0, word: "", reason: "missing-trust" },
    ],
  });
});

test("model matching is whole-word and case-insensitive outside fenced code", () => {
  const ticket = [routing, "Read the sonnets of Shakespeare.", "````text", "sonnets of Shakespeare", "```", "Opus", "````", "~~~", "KIMI", "~~~", "Use sonnet."].join("\r\n");
  assert.deepEqual(checkTicketWording(ticket), {
    ok: false, hits: [{ line: 12, word: "sonnet", reason: "model-name" }],
  });
  assert.deepEqual(checkTicketWording("Example only\n```\ntier: low\ntrust: untrusted\n```"), {
    ok: false,
    hits: [
      { line: 0, word: "", reason: "missing-tier" },
      { line: 0, word: "", reason: "missing-trust" },
    ],
  });
});

test("empty or non-string input returns an empty diagnostic", () => {
  for (const ticket of ["", "  \n", null, 42]) {
    assert.deepEqual(checkTicketWording(ticket), {
      ok: false, hits: [{ line: 0, word: "", reason: "empty" }],
    });
  }
});
