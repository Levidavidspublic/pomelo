import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloDriverBanner, type PomeloDriverBannerProps } from "../src/client/pomelo/PomeloDriverBanner.js";
import { driverBanner } from "../src/client/pomelo/driver-banner.js";

const codex = { tool: "codex", name: "Codex", path: "/bin/codex", loggedIn: false } as const;

function render(banner: PomeloDriverBannerProps["banner"]) {
  return renderToStaticMarkup(createElement(PomeloDriverBanner, { banner, onOpenSettings: () => {} }));
}

test("a signed-out driver shows one plain line and one Settings button in a status region", () => {
  const html = render(driverBanner([codex]));

  assert.match(html, /role="status"/);
  assert.match(html, /<p>Sign in to Claude Code \/ Codex on this machine<\/p>/);
  assert.equal(html.match(/<button\b/g)?.length, 1);
  assert.match(html, /<button\b[^>]*\btype="button"[^>]*>Open Settings<\/button>/);
  assert.doesNotMatch(html, /\bautofocus\b|\btabindex\b/i);
});

test("the Settings button calls onOpenSettings", () => {
  let opened = 0;
  const banner = PomeloDriverBanner({
    banner: driverBanner([codex]),
    onOpenSettings: () => { opened++; },
  });
  assert.ok(banner);
  const button = Children.toArray(banner.props.children).find(
    (child) => isValidElement(child) && child.type === "button",
  );
  assert.ok(isValidElement<{ onClick: () => void }>(button));
  assert.equal(opened, 0);
  button.props.onClick();
  assert.equal(opened, 1);
});

test("a usable driver renders nothing", () => {
  assert.equal(render(driverBanner([{ ...codex, loggedIn: true }])), "");
  assert.equal(render(driverBanner([{ ...codex, loggedIn: null }])), "");
});

test("the status region follows the direction of its message", () => {
  const banner = driverBanner([]);
  assert.ok(banner);
  const english = render(banner);
  assert.match(english, /<div\b[^>]*\bdir="ltr"/);
  assert.match(english, /<p>Install Claude Code, Codex, or OpenCode on this machine<\/p>/);

  const hebrew = render({ ...banner, text: "יש להתקין את Codex במחשב הזה" });
  assert.match(hebrew, /<div\b[^>]*\bdir="rtl"/);
  assert.match(hebrew, /<p>יש להתקין את Codex במחשב הזה<\/p>/);
});

test("every banner state stays free of login fields and external links", () => {
  const tool = { ...codex, name: "https://example.invalid" };
  for (const tools of [[], [tool], [{ ...tool, loggedIn: true }], [{ ...tool, loggedIn: null }]]) {
    const html = render(driverBanner(tools));
    assert.doesNotMatch(html, /<form\b|<input\b|type="password"|<a\b|claude\.ai|anthropic\.com|https?:\/\//i);
  }
});
