import assert from "node:assert/strict";
import test from "node:test";
import { captchaStop } from "../src/pomelo/browser/captcha-stop.js";

const emptyPage = Object.freeze({
  title: "",
  url: "",
  text: "",
  cut: false,
  items: Object.freeze([]),
  fields: Object.freeze([]),
});

function assertHold(result: ReturnType<typeof captchaStop>) {
  assert.ok(result);
  assert.deepEqual(result, { state: "waiting", reason: "captcha", allowedAnswers: ["handoff", "cancel"] });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.allowedAnswers));
}

for (const item of [
  'iframe "reCAPTCHA"',
  '[1] checkbox "hCaptcha security challenge"',
  'iframe "Cloudflare Turnstile"',
  '[2] field:text "CAPTCHA"',
]) {
  test(`holds for the challenge item ${item}`, () => {
    assertHold(captchaStop({ ...emptyPage, items: Object.freeze([item]) }));
  });
}

for (const text of [
  "Verify you are human",
  "Sign in\nPlease verify that you are human to continue.\nContinue",
  "I'm not a robot",
  "I’m not a robot",
  "Are you human?",
]) {
  test(`holds for the verification prompt ${JSON.stringify(text)}`, () => {
    assertHold(captchaStop({ ...emptyPage, text }));
  });
}

test("holds for a challenge page title or a dedicated challenge URL", () => {
  assertHold(captchaStop({ ...emptyPage, title: "Just a moment..." }));
  assertHold(captchaStop({ ...emptyPage, title: "Just a moment…" }));
  assertHold(captchaStop({ ...emptyPage, url: "https://example.invalid/cdn-cgi/challenge-platform/check" }));
});

test("holds for a CAPTCHA field name or label with masked values", () => {
  const byName = Object.freeze({ name: "g-recaptcha-response", value: "••••" });
  const byLabel = Object.freeze({ name: "response", label: "Enter CAPTCHA code", value: "••••" });
  assertHold(captchaStop({ ...emptyPage, fields: Object.freeze([byName]) }));
  assertHold(captchaStop({ ...emptyPage, fields: Object.freeze([byLabel]) }));
});

test("returns null for a normal login form or an empty read", () => {
  const fields = [{ name: "login" }, { name: "password", value: "••••" }, { name: "verification", autocomplete: "one-time-code" }];
  assert.equal(captchaStop({
    ...emptyPage,
    title: "Sign in",
    url: "https://example.invalid/login",
    text: "Sign in\nUser name\nPassword\nVerification code",
    items: ['[1] field:text "User name"', '[2] field:password "Password"', '[3] button "Sign in"'],
    fields,
  }), null);
  assert.equal(captchaStop(emptyPage), null);
});

test("returns null for an article discussing CAPTCHAs and quoting challenge prompts", () => {
  const discussion = "Sites sometimes say ‘verify you are human’ or show a checkbox labeled \"I'm not a robot\". The article compares reCAPTCHA, hCaptcha and Turnstile.";
  assert.equal(captchaStop({
    ...emptyPage,
    title: "How CAPTCHAs work",
    url: "https://example.invalid/news/how-captchas-work?topic=recaptcha",
    text: `${discussion}\n\n`.repeat(20),
    items: ['[1] link "More news"'],
  }), null);
});
