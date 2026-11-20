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

test("masks a padded base64 token that contains a slash", () => {
  const token = ["Ab9z", "qW2x", "7Lm0", "eT3u", "Cr6o", "vX5n", "pY4f", "/Kb8", "sdQ="].join("");
  assert.deepEqual(cleanHandoffPrompt(token, "open_thread"), { ok: true, prompt: "••••", hidden: 1, cut: false });
});

test("masks a 40-character cloud key with a slash and no padding", () => {
  const token = ["Ab9z", "qW2x", "7Lm0", "eT3u", "Cr6o", "vX5n", "pY4f", "/Kb8", "sdQ1", "Vz6N"].join("");
  const result = cleanHandoffPrompt(`Check ${token}.`, "open_thread");
  assert.deepEqual(result, { ok: true, prompt: "Check ••••.", hidden: 1, cut: false });
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("masks 32- and 64-character hex credentials and labeled 40-character keys", () => {
  const fragment = ["e9b1", "40c8"].join("");
  const raw = `Check ${fragment.repeat(4)} and ${fragment.repeat(8)}. API_KEY=${fragment.repeat(5)}`;
  const result = cleanHandoffPrompt(raw, "open_thread");
  assert.deepEqual(result, { ok: true, prompt: "Check •••• and ••••. API_KEY=••••", hidden: 3, cut: false });
});

test("keeps repository links, commit hashes, UUIDs and long code identifiers intact", () => {
  const prompts = [
    "Review https://github.com/ExampleOrganization/example-project/pull/123.",
    "Compare commit 3a2f6b98c41d005e3ef9a7b42f043af62ae8b901.",
    "Resume session c5b91397-2ec1-452b-8f03-e77b4c8d9b5a.",
    "Inspect getCurrentThreadConfigurationFromSettings.",
    "Inspect getCurrentThreadConfigurationFromPhase2Settings.",
    "Keep getCurrentThreadConfigurationFromSettings=enabled.",
    "Switch to p1-86-backend-handoff-prompt-rule-function.",
    "Read current_phase_2_handoff_prompt_configuration.",
    "Inspect CurrentThreadConfigurationFromPhase2Settings.",
  ];
  for (const prompt of prompts) {
    assert.deepEqual(cleanHandoffPrompt(prompt, "open_thread"), { ok: true, prompt, hidden: 0, cut: false });
  }
});

test("keeps comparisons, arrows and token limits intact", () => {
  const prompt = "if (token === saved || password == saved) check(token => token); max_token=100";
  assert.deepEqual(cleanHandoffPrompt(prompt, "spawn_subagent"), { ok: true, prompt, hidden: 0, cut: false });
});

test("masks token query values without damaging the rest of the repository link", () => {
  const url = "https://github.com/ExampleOrganization/example-project/pull/123";
  const result = cleanHandoffPrompt(`${url}?token=${canary}&max_token=100&view=files&access_token=x#top`, "open_thread");
  assert.deepEqual(result, {
    ok: true, prompt: `${url}?token=••••&max_token=100&view=files&access_token=••••#top`, hidden: 2, cut: false,
  });
});

test("masks short assigned credentials and keeps punctuation inside their values", () => {
  const password = ["test", ",;&)}]", "tail"].join("");
  const result = cleanHandoffPrompt(`DB_PASSWORD=${password} access_token=x API_TOKEN=y API_KEY=z`, "open_thread");
  assert.deepEqual(result, {
    ok: true, prompt: "DB_PASSWORD=•••• access_token=•••• API_TOKEN=•••• API_KEY=••••", hidden: 4, cut: false,
  });
  assert.equal(JSON.stringify(result).includes("tail"), false);
});

test("masks an assignment with an unterminated quote through the end of the prompt", () => {
  const secret = ["sample", "secret"].join(" ");
  const result = cleanHandoffPrompt(`Use API_TOKEN="${secret}\ncontinuation`, "open_thread");
  assert.deepEqual(result, { ok: true, prompt: 'Use API_TOKEN="••••', hidden: 1, cut: false });
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

test("masks a bare vault path with spaces in the vault and item names", () => {
  const vaultPath = `op://${["example vault", "sample item", "sample-field"].join("/")}`;
  const result = cleanHandoffPrompt(`Read (${vaultPath}) before continuing.`, "open_thread");
  assert.deepEqual(result, { ok: true, prompt: "Read (••••) before continuing.", hidden: 1, cut: false });
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
