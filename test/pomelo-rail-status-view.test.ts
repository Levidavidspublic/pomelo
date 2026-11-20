import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloRailStatus } from "../src/client/pomelo/PomeloRailStatus.js";
import { railState, type RailStateInput, type RailStateView } from "../src/client/pomelo/rail-state.js";

const now = 300_000;

function view(input: Partial<RailStateInput>) {
  return railState({ loaded: false, loading: false, failed: false, rowCount: 0, now, ...input });
}

const firstLoad = view({ loading: true });
const empty = view({ loaded: true });
const failed = view({ failed: true });
const stale = view({ loaded: true, failed: true, rowCount: 2, lastGoodAt: now - 120_000 });
const ready = view({ loaded: true, rowCount: 2 });
const refreshing = view({ loaded: true, loading: true, rowCount: 2 });

function render(view: RailStateView, loadingText?: string) {
  return renderToStaticMarkup(createElement(PomeloRailStatus, { view, loadingText, onRetry: () => {} }));
}

test("the first load shows one quiet loading line in a busy status region", () => {
  const html = render(firstLoad);

  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /dir="ltr"/);
  assert.equal(html.match(/>Loading threads</g)?.length, 1);
  assert.doesNotMatch(html, /<button\b|animate-|animation|spinner|<svg\b/i);
});

test("an empty rail shows the model's note with no retry button", () => {
  const html = render(empty);

  assert.match(html, /role="status"/);
  assert.ok(html.includes(`>${empty.note}<`));
  assert.doesNotMatch(html, /<button\b|aria-busy="true"/);
});

for (const state of [failed, stale]) {
  test(`the ${state.kind} rail shows the model's note and one Try again button`, () => {
    const html = render(state);

    assert.match(html, /role="status"/);
    assert.ok(html.includes(`>${state.note}<`));
    assert.equal(html.match(/<button\b/g)?.length, 1);
    assert.match(html, /<button\b[^>]*\btype="button"[^>]*>Try again<\/button>/);
    assert.doesNotMatch(html, /aria-busy="true"/);
  });
}

test("the retry button calls onRetry exactly once per press", () => {
  for (const view of [failed, stale]) {
    let retries = 0;
    const status = PomeloRailStatus({ view, onRetry: () => { retries++; } });
    assert.ok(status);
    const button = Children.toArray(status.props.children).find(
      (child) => isValidElement(child) && child.type === "button",
    );
    assert.ok(isValidElement<{ onClick: () => void }>(button));
    assert.equal(retries, 0);
    button.props.onClick();
    assert.equal(retries, 1);
    button.props.onClick();
    assert.equal(retries, 2);
  }
});

test("ready and refreshing rails render nothing", () => {
  assert.equal(render(ready), "");
  assert.equal(render(refreshing), "");
});

test("the status region follows Hebrew loading text", () => {
  const html = render(firstLoad, "טוען שיחות");

  assert.match(html, /<div\b[^>]*\brole="status"[^>]*\bdir="rtl"/);
  assert.match(html, />טוען שיחות</);
});

test("no rail status sets focus or draws a link or form control other than retry", () => {
  for (const state of [firstLoad, empty, failed, stale, ready, refreshing]) {
    assert.doesNotMatch(render(state), /\bautofocus\b|\btabindex\b|<a\b|<form\b|<input\b/i);
  }
});
