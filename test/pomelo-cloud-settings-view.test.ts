import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../src/client/components/ui/button.js";
import { PomeloCloudSettings } from "../src/client/pomelo/PomeloCloudSettings.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";

const now = 1_000_000;
const reachable = { id: "reachable", name: "דפדפן בענן", location: "cloud", cdpUrlName: "POMELO_CDP_URL" };
const slow = { ...reachable, id: "slow", name: "Slow browser", cdpUrlName: "POMELO_CDP_URL_SLOW" };
const unreachable = { ...reachable, id: "unreachable", name: "Offline browser", cdpUrlName: "POMELO_CDP_URL_OFFLINE" };
const reachByProfileId = {
  reachable: { state: "reachable", lastOkAt: now - 10_000 },
  slow: { state: "slow", lastOkAt: now - 120_000 },
  unreachable: { state: "unreachable", lastOkAt: null },
};

function render(profiles: unknown, reports: unknown = reachByProfileId) {
  return renderToStaticMarkup(createElement(PomeloCloudSettings, {
    profiles, reachByProfileId: reports, now, onCheckAgain: () => {},
  }));
}

test("lists each cloud profile with its environment name, state in words, and last seen label", () => {
  const html = render([slow, reachable, unreachable]);

  assert.match(html, /<h2\b[^>]*>Cloud browser<\/h2>/);
  assert.match(html, /role="status"[^>]*>VPS browser is set up and reachable\.<\/p>/);
  assert.match(html, /<ul\b/);
  const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  assert.equal(rows.length, 3);
  for (const [profile, state, lastSeen] of [
    [reachable, "Reachable", "Last seen 10 seconds ago"],
    [slow, "Slow", "Last seen 2 minutes ago"],
    [unreachable, "VPS not reachable", "Never seen"],
  ] as const) {
    const row = rows.find((item) => item.includes(`>${profile.name}<`));
    assert.ok(row, `Missing row for ${profile.name}`);
    assert.ok(row.includes(`>${profile.cdpUrlName}<`));
    assert.ok(row.includes(`>${state}<`));
    assert.ok(row.includes(`>${lastSeen}<`));
  }
  assert.match(html, /\bdir="auto"[^>]*>דפדפן בענן</);
});

test("announces the setup and reachability summary as one status line", () => {
  for (const [profile, summary] of [
    [reachable, "VPS browser is set up and reachable."],
    [slow, "VPS browser is set up. The connection is slow."],
    [unreachable, "VPS browser is set up. VPS not reachable."],
  ] as const) {
    const html = render([profile]);

    assert.deepEqual(Array.from(html.matchAll(/<p\b[^>]*\brole="status"[^>]*>([^<]*)<\/p>/g), ([, label]) => label), [summary]);
  }
});

test("empty and local-only profile lists show the not-set-up status and setup message", () => {
  for (const profiles of [[], [{ ...reachable, location: "local" }]]) {
    const html = render(profiles);

    assert.match(html, /role="status"[^>]*>VPS browser is not set up\.<\/p>/);
    assert.match(html, />Add a cloud browser profile with a Pomelo environment variable name\.<\/p>/);
    assert.doesNotMatch(html, /<ul\b|<li\b|POMELO_CDP_URL/);
  }
});

test("the single Check again button calls onCheckAgain", () => {
  const props = { profiles: [reachable], reachByProfileId, now, onCheckAgain: test.mock.fn<() => void>() };
  const html = renderToStaticMarkup(createElement(PomeloCloudSettings, props));
  assert.equal(html.match(/<button\b/g)?.length, 1);
  assert.match(html, /<button\b[^>]*\btype="button"[^>]*>Check again<\/button>/);

  const view = PomeloCloudSettings(props);
  const button = Children.toArray(view.props.children).find((child) => isValidElement(child) && child.type === Button);
  assert.ok(isValidElement<{ onClick: () => void }>(button));
  assert.equal(props.onCheckAgain.mock.callCount(), 0);
  button.props.onClick();
  assert.equal(props.onCheckAgain.mock.callCount(), 1);
});

test("raw connection details and the synthetic credential stay out of the markup", () => {
  const canary = 'Fixture-760-canary"+/=';
  const endpoint = "ws://127.0.0.1:9222/devtools/browser/fixture";
  const profile = { ...reachable, token: canary, endpoint };
  const report = { ...reachByProfileId.reachable, token: canary, endpoint, url: "http://browser.invalid:9222" };
  const html = render([profile], { [profile.id]: report });

  assertNoCanary(canary, { markup: html });
  assert.equal(/(?:wss?|https?):\/\/|\b127\.0\.0\.1\b|\b9222\b|browser\.invalid/.test(html), false);
  assert.match(html, /role="status"[^>]*>Cloud browser setup needs fixing\.<\/p>/);
  assert.match(html, />Needs fixing</);
  assert.match(html, />POMELO_CDP_URL</);
});
