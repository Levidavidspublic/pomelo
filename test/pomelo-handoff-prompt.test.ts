import assert from "node:assert/strict";
import test from "node:test";
import { cleanHandoffPrompt, DEFAULT_HANDOFF_PROMPT_LIMIT } from "../src/pomelo/handoff-prompt.js";

const canary = ["sk", "HandoffTest9".repeat(4)].join("-");

test("keeps English, Hebrew with niqqud, and mixed prompts intact for both tools", () => {
  for (const tool of ["open_thread", "spawn_subagent"] as const) {
    for (const prompt of ["Plan the release.", "תִּכְנוּן הַפְּרוֹיֶקְט", "תִּכְנוּן release 2"]) {
      assert.deepEqual(cleanHandoffPrompt(prompt, tool), { ok: true, prompt, hidden: 0, cut: false });
    }
  }
});

test("refuses non-strings and empty prompts with a plain reason", () => {
  for (const input of [42, null, "", " \t\n ", "\u0000\u200B\u202E"]) {
    const result = cleanHandoffPrompt(input, "open_thread");
    assert.ok(!result.ok);
    assert.match(result.reason, /prompt/i);
  }
});

test("strips controls and invisible formatting while keeping newlines, tabs and Hebrew marks", () => {
  const raw = " \nשָׁ\u0000לוֹם\u007F\u0085\u202E\u200E\u200B\u200D\u2060\u2069\n\tPlan\r now. \t";
  assert.deepEqual(cleanHandoffPrompt(raw, "spawn_subagent"), {
    ok: true,
    prompt: "שָׁלוֹם\n\tPlan now.",
    hidden: 0,
    cut: false,
  });
});

test("masks a standalone canary token in full after removing invisible characters", () => {
  const obscured = canary.replace("-", "-\u200B");
  const result = cleanHandoffPrompt(`Check ${obscured} before continuing.`, "open_thread");
  assert.deepEqual(result, { ok: true, prompt: "Check •••• before continuing.", hidden: 1, cut: false });
  assert.equal(JSON.stringify(result).includes(canary), false);
});

test("masks a long token with no provider prefix", () => {
  const token = ["Handoff", "Fixture", "9Qm"].join("").repeat(3);
  const file = "src/client/pomelo/phase1/settings.tsx";
  const result = cleanHandoffPrompt(`Check ${token} in ${file}.`, "spawn_subagent");
  assert.deepEqual(result, { ok: true, prompt: `Check •••• in ${file}.`, hidden: 1, cut: false });
});

test("masks complete vault paths, private keys and assigned values once each", () => {
  const vaultPath = `op://${["example-vault", "sample-item", "sample-field"].join("/")}`;
  const keyBlock = ["-----BEGIN TEST PRIVATE KEY-----", canary, "-----END TEST PRIVATE KEY-----"].join("\n");
  const raw = `Read (${vaultPath})\n${keyBlock}\npassword=x token="${canary} sample"`;
  const result = cleanHandoffPrompt(raw, "spawn_subagent");
  assert.deepEqual(result, {
    ok: true,
    prompt: 'Read (••••)\n••••\npassword=•••• token="••••"',
    hidden: 4,
    cut: false,
  });
  assert.equal(JSON.stringify(result).includes(vaultPath), false);
  assert.equal(JSON.stringify(result).includes(canary), false);
  assert.deepEqual(cleanHandoffPrompt('password=•••• token="••••"', "spawn_subagent"), {
    ok: true,
    prompt: 'password=•••• token="••••"',
    hidden: 0,
    cut: false,
  });
});

test("counts a quoted vault path or multiline assigned value as one secret", () => {
  const vaultPath = `op://${["example vault", "sample item", "token=sample field"].join("/")}`;
  const value = ["sample", "value"].join("\n");
  const result = cleanHandoffPrompt(`Read "${vaultPath}" and password="${value}".`, "open_thread");
  assert.deepEqual(result, { ok: true, prompt: 'Read "••••" and password="••••".', hidden: 2, cut: false });
});

test("refuses a long prompt even when masking would bring it under the limit", () => {
  const raw = `Review this example: ${canary}`;
  const result = cleanHandoffPrompt(raw, "open_thread", 30);
  assert.ok(!result.ok);
  assert.match(result.reason, /too long|limit/i);
  assert.equal(result.reason.includes(raw), false);
  assert.equal(result.reason.includes(canary), false);
});

test("checks the limit when a mask adds code points", () => {
  assert.equal(cleanHandoffPrompt("token=x", "open_thread", 7).ok, false);
});

test("counts code points and keeps emoji and Hebrew with marks whole at the limit", () => {
  const prompt = "שָׁ😀";
  assert.deepEqual(cleanHandoffPrompt(prompt, "open_thread", 4), { ok: true, prompt, hidden: 0, cut: false });
  assert.equal(cleanHandoffPrompt(prompt, "open_thread", 3).ok, false);
  assert.equal(cleanHandoffPrompt("שָׁ", "spawn_subagent", 2).ok, false);

  assert.equal(DEFAULT_HANDOFF_PROMPT_LIMIT, 8_000);
  const atDefaultLimit = "😀".repeat(DEFAULT_HANDOFF_PROMPT_LIMIT);
  assert.equal(cleanHandoffPrompt(atDefaultLimit, "spawn_subagent").ok, true);
  assert.equal(cleanHandoffPrompt(`${atDefaultLimit}א`, "spawn_subagent").ok, false);
});
