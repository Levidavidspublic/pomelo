import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloTagSuggestions } from "../src/client/pomelo/PomeloTagSuggestions.js";
import { tagColour } from "../src/client/pomelo/tag-colour.js";
import { dismissSuggestion, suggestionChips, type TagProposal } from "../src/client/pomelo/tag-suggest.js";

const thread = { id: "thread-1" };

function proposal(slug: string, label: string, at = 1): TagProposal {
  return { threadId: thread.id, slug, label, at, proposedBy: "agent-1" };
}

function render(proposals: readonly TagProposal[], dismissed?: readonly string[]) {
  return renderToStaticMarkup(createElement(PomeloTagSuggestions, {
    chips: suggestionChips(thread, proposals, dismissed),
    onAccept: () => {},
    onDismiss: () => {},
  }));
}

test("renders each suggested project in a named list with two labelled buttons", () => {
  const html = render([proposal("notes", "Notes"), proposal("pomelo", "Pomelo", 2)]);

  assert.match(html, /<ul\b[^>]*\baria-label="Suggested projects"/);
  const items = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  assert.equal(items.length, 2);
  ["Pomelo", "Notes"].forEach((name, index) => {
    const item = items[index];
    assert.ok(item.includes(`>${name}<`));
    const buttons = item.match(/<button\b[^>]*>/g) ?? [];
    assert.equal(buttons.length, 2);
    for (const button of buttons) assert.match(button, /\btype="button"/);
    assert.deepEqual(buttons.map((button) => button.match(/\baria-label="([^"]+)"/)?.[1]), [
      `Add to project ${name}`,
      `Dismiss suggestion ${name}`,
    ]);
  });
});

test("renders nothing when there are no proposals or all proposals are dismissed", () => {
  const proposals = [proposal("pomelo", "Pomelo"), proposal("notes", "Notes")];
  const dismissed = dismissSuggestion(dismissSuggestion({}, thread.id, "pomelo"), thread.id, "notes");

  assert.equal(render([]), "");
  assert.equal(render(proposals, dismissed[thread.id]), "");
});

test("renders the Hebrew project name right to left", () => {
  const html = render([proposal("pomelo", "פומלו")]);

  assert.match(html, /<[^>]+\bdir="rtl"[^>]*>פומלו</);
});

test("uses the tag colour rule for stored, missing, and invalid colours", () => {
  const suggested = proposal("pomelo", "Pomelo");
  const storedColour = "#E2E8EF";
  const badColour = "#123456;background:url(example.invalid)";
  const { bg, fg } = tagColour(suggested.slug, storedColour);
  const fallback = tagColour(suggested.slug);
  const stored = { ...suggested, colour: storedColour };
  const invalid = { ...suggested, colour: badColour };

  assert.ok(render([stored]).includes(`style="background-color:${bg};color:${fg}"`));
  for (const input of [suggested, invalid]) {
    const html = render([input]);
    assert.ok(html.includes(`style="background-color:${fallback.bg};color:${fallback.fg}"`));
    assert.doesNotMatch(html, /example\.invalid/);
  }
});

test("escapes the project name in the chip and its button labels without autofocus or animation", () => {
  const html = render([proposal("review", 'Review "<script>"')]);
  const escapedName = "Review &quot;&lt;script&gt;&quot;";

  assert.ok(html.includes(`>${escapedName}<`));
  assert.ok(html.includes(`aria-label="Add to project ${escapedName}"`));
  assert.ok(html.includes(`aria-label="Dismiss suggestion ${escapedName}"`));
  assert.doesNotMatch(html, /<\/?script\b|\sautofocus\b|animate-(?:pulse|spin)/i);
});
