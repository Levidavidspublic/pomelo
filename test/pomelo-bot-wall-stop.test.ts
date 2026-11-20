import assert from "node:assert/strict";
import test from "node:test";
import { checkBotWall } from "../src/pomelo/browser/bot-wall-stop.js";

const plainPage = {
  url: "https://example.invalid/account",
  title: "Account",
  text: "Welcome to your account.",
};
const fresh = { waitsSoFar: 0, reloadsSoFar: 0 };
const checkingPage = { ...plainPage, text: "Checking your browser before accessing the site." };

test("goes on when the page has no wall, even after two reloads", () => {
  const result = checkBotWall(plainPage, { ...fresh, reloadsSoFar: 2 });
  assert.equal(result.verdict, "go-on");
  assert.equal(result.kind, undefined);
  assert.equal(result.card, undefined);
});

test("waits twice for a browser check to clear and then holds", () => {
  for (const waitsSoFar of [0, 1]) {
    const result = checkBotWall(checkingPage, { ...fresh, waitsSoFar });
    assert.equal(result.verdict, "wait");
    assert.equal(result.kind, "checking");
    assert.equal(result.card, undefined);
  }

  const result = checkBotWall(checkingPage, { ...fresh, waitsSoFar: 2 });
  assert.equal(result.verdict, "hold");
  assert.equal(result.kind, "checking");
  assert.ok(result.card);
});

test("reads self-clearing check messages from the title or body", () => {
  for (const read of [
    { ...plainPage, title: "Just a moment...", text: "" },
    { ...plainPage, text: "We are verifying you are human. This may take a few seconds." },
  ]) {
    const result = checkBotWall(read, fresh);
    assert.equal(result.verdict, "wait");
    assert.equal(result.kind, "checking");
  }
});

test("leaves a puzzle prompt for the CAPTCHA rule", () => {
  for (const text of ["Complete the CAPTCHA to continue.", "Please verify that you are human to continue."]) {
    const read = { ...plainPage, title: "Just a moment...", text };
    assert.equal(checkBotWall(read, fresh).verdict, "go-on");
  }
});

test("holds immediately on a 403 access denied page", () => {
  const result = checkBotWall({ ...plainPage, title: "Access denied", text: "Access denied.", status: 403 }, fresh);
  assert.equal(result.verdict, "hold");
  assert.equal(result.kind, "blocked");
});

test("holds immediately on refusal messages without an HTTP status", () => {
  for (const text of [
    "You have been blocked.",
    "We detected unusual traffic from your network.",
    "Request blocked.",
    "הגישה נחסמה",
    "הגישה נדחתה",
  ]) {
    const result = checkBotWall({ ...plainPage, text }, fresh);
    assert.equal(result.verdict, "hold", text);
    assert.equal(result.kind, "blocked", text);
  }
});

test("holds for a short 451 page", () => {
  const result = checkBotWall({ ...plainPage, text: "Unavailable", status: 451 }, fresh);
  assert.equal(result.verdict, "hold");
  assert.equal(result.kind, "blocked");
});

test("uses under 600 characters as the limit for a status-only 403 or 451 hold", () => {
  for (const status of [403, 451]) {
    assert.equal(checkBotWall({ ...plainPage, status, text: "x".repeat(599) }, fresh).verdict, "hold");
    assert.equal(checkBotWall({ ...plainPage, status, text: "x".repeat(600) }, fresh).verdict, "go-on");
  }
});

test("holds for a 429 or a full-page rate message and points to the pace rule", () => {
  for (const read of [
    { ...plainPage, status: 429 },
    { ...plainPage, text: "429 Too Many Requests\nPlease slow down." },
    { ...plainPage, text: "Example site\nToo   Many Requests\nPlease slow down." },
  ]) {
    const result = checkBotWall(read, fresh);
    assert.equal(result.verdict, "hold");
    assert.equal(result.kind, "rate-page");
    assert.match(result.reason, /pace rule/i);
  }
});

test("goes on when an ordinary page only mentions a wall or rate message", () => {
  const text = "If you see ‘access denied’, consult your administrator.".padEnd(4_000, "x");
  assert.equal(checkBotWall({ ...plainPage, title: "Access denied troubleshooting", text }, fresh).verdict, "go-on");
  assert.equal(checkBotWall({ ...plainPage, text: "This guide explains the ‘too many requests’ error." }, fresh).verdict, "go-on");
  assert.equal(checkBotWall({ ...plainPage, text: "Too many requests errors are common on busy servers." }, fresh).verdict, "go-on");
});

test("goes on for a 403 with a long page and no wall phrase", () => {
  const text = "Account information. ".repeat(200);
  assert.equal(checkBotWall({ ...plainPage, text, status: 403 }, fresh).verdict, "go-on");
});

test("holds when a check still shows after two reloads", () => {
  assert.equal(checkBotWall(checkingPage, { ...fresh, reloadsSoFar: 1 }).verdict, "wait");
  const result = checkBotWall(checkingPage, { ...fresh, reloadsSoFar: 2 });
  assert.equal(result.verdict, "hold");
  assert.equal(result.kind, "checking");
  assert.ok(result.card);
});

test("matches across differences in case and whitespace", () => {
  const result = checkBotWall({ ...plainPage, text: "  ChEcKiNg   yOuR\n\tBrOwSeR  " }, fresh);
  assert.equal(result.verdict, "wait");
  assert.equal(result.kind, "checking");
});

test("the hold card names only the site host and offers a human handoff or cancellation", () => {
  const url = "https://example.invalid/entry?source=fixture";
  const result = checkBotWall({ ...plainPage, url, text: "Access denied." }, fresh);
  assert.ok(result.card);
  assert.match(result.card.body, /example\.invalid/);
  assert.match(result.card.body, /blocked the automated browser/i);
  assert.match(result.card.body, /Amit can open the page himself or cancel/i);
  assert.doesNotMatch(result.card.body, /https:\/\/|\/entry|\?source=fixture/);
  assert.doesNotMatch(JSON.stringify(result), /proxy|user agent|clear cookies/i);
});

test("keeps the made-up canary from page text and the URL query out of the result", () => {
  const canary = "made-up-bot-wall-canary";
  const url = `https://example.invalid/account?fixture=${canary}`;
  const text = `Access denied.\n${canary}`;
  const result = checkBotWall({ ...plainPage, url, text }, fresh);
  assert.equal(result.verdict, "hold");
  assert.equal(JSON.stringify(result).includes(canary), false);
});
