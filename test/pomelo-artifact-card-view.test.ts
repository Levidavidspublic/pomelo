import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { artifactOpenPayload, PomeloArtifactCard } from "../src/client/pomelo/PomeloArtifactCard.js";

type Props = ComponentProps<typeof PomeloArtifactCard>;

const card = { id: "weekly-report", kind: "html", title: "Weekly report", version: 3 } as const;
const props: Props = { card, onOpen: () => {} };

function render(overrides: Partial<Props> = {}) {
  const html = renderToStaticMarkup(createElement(PomeloArtifactCard, { ...props, ...overrides }));
  assert.doesNotMatch(html, /<(?:iframe|a|script)\b|\bhref=|\bautofocus\b|style="[^"]*#[0-9a-f]{3,8}\b/i);
  return html;
}

function textContent(html: string) {
  return html.replace(/<[^>]+>/g, "");
}

test("renders the English label, kind, and version with one native Open button", () => {
  const html = render();
  assert.match(html, /^<div\b[^>]*\brole="group"/);
  assert.match(html, /dir="ltr"[^>]*><span[^>]*>HTML page: <\/span><span[^>]*>Weekly report<\/span>/);
  assert.match(textContent(html), /HTML page: Weekly report, version 3/);
  assert.equal(html.match(/<button\b/g)?.length, 1);
  assert.match(html, /<button\b[^>]*type="button"[^>]*aria-label="Open Weekly report"[^>]*>Open<\/button>/);
  assert.doesNotMatch(html, /\bdisabled=/);
});

test("gives a Hebrew label its own right-to-left direction", () => {
  const title = "דוח שבועי";
  const html = render({ card: { ...card, title } });
  assert.match(html, /dir="rtl"[^>]*><span[^>]*>HTML page: <\/span><span[^>]*>דוח שבועי<\/span>/);
  assert.match(html, /aria-label="Open דוח שבועי"/);
});

test("names each artifact kind in words", () => {
  for (const [kind, word] of [
    ["mermaid", "Diagram"], ["chart", "Chart"], ["image", "Image"], ["artifact", "HTML page"], ["diagram", "Diagram"],
  ] as const) {
    assert.ok(textContent(render({ card: { ...card, kind } })).includes(`${word}: Weekly report, version 3`));
  }
});

test("shows Put away and disables Open for an archived card", () => {
  const html = render({ archived: true });
  assert.match(html, />Put away<\//);
  const button = html.match(/<button\b[^>]*>/)?.[0];
  assert.ok(button);
  assert.match(button, /aria-disabled="true"/);
  assert.match(button, /\sdisabled=""/);
});

test("escapes title text, strips tags, and leaves the artifact body out of chat", () => {
  const cardWithBody = {
    ...card,
    title: "Weekly & <script> report",
    body: '<main>Body only</main><iframe></iframe><a href="/draft">Draft</a>',
  };
  const html = render({ card: cardWithBody });
  assert.match(textContent(html), /HTML page: Weekly &amp; report, version 3/);
  assert.match(html, /aria-label="Open Weekly &amp; report"/);
  assert.doesNotMatch(html, /Body only|&lt;script|<main\b/);
});

test("uses the plain kind word when the title contains a synthetic key-shaped canary", () => {
  const fakeKey = "sk-" + "a".repeat(40);
  const html = render({ card: { ...card, title: `Draft ${fakeKey}` } });
  assert.match(textContent(html), /^HTML page, version 3/);
  assert.match(html, /aria-label="Open HTML page"/);
  assert.ok(!html.includes(fakeKey));
  assert.doesNotMatch(html, /Draft|secret hidden/);
});

test("builds the exact open payload only for a usable ID and version", () => {
  assert.deepEqual(artifactOpenPayload(card), { artifactId: "weekly-report", version: 3 });
  assert.equal(artifactOpenPayload({ version: 3 }), null);
  assert.equal(artifactOpenPayload({ ...card, id: " " }), null);
  assert.equal(artifactOpenPayload({ ...card, id: "../report" }), null);
  assert.equal(artifactOpenPayload({ ...card, version: 0 }), null);
  assert.equal(artifactOpenPayload({ ...card, version: 1.5 }), null);
  assert.equal(artifactOpenPayload({ ...card, version: Number.MAX_SAFE_INTEGER + 1 }), null);
});

test("Open passes the selected artifact and version and ignores an archived or invalid card", (t) => {
  const onOpen = t.mock.fn<Props["onOpen"]>();

  function click(overrides: Partial<Props> = {}) {
    const row = PomeloArtifactCard({ ...props, onOpen, ...overrides });
    const button = Children.toArray(row.props.children).find(
      (child) => isValidElement<ComponentProps<"button">>(child) && child.type === "button",
    );
    assert.ok(isValidElement<ComponentProps<"button">>(button));
    assert.ok(button.props.onClick);
    Reflect.apply(button.props.onClick, undefined, []);
  }

  click();
  click({ archived: true });
  click({ card: { ...card, version: 0 } });
  assert.deepEqual(onOpen.mock.calls.map((call) => call.arguments), [[{ artifactId: "weekly-report", version: 3 }]]);
});
