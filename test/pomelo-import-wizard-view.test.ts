import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloImportWizard } from "../src/client/pomelo/PomeloImportWizard.js";
import { importWizard } from "../src/client/pomelo/import-wizard.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";

const ready = {
  extensionPaired: true,
  sourceProfile: "Profile 1",
  sites: ["one.example.test", "two.example.test"],
  targetProfileId: "local",
  profiles: [{ id: "local", location: "local" }],
} satisfies Parameters<typeof importWizard>[0];

const finished = {
  targetProfileId: ready.targetProfileId,
  endedAt: 2_000,
  sites: ready.sites.map((site) => ({ site, result: "imported" })),
};

const stepLabels = [
  "Install and pair the Chrome companion extension",
  "Choose the Chrome profile and sites",
  "Choose the Pomelo profile",
  "Run import",
  "Review results",
];

function render(input: Parameters<typeof importWizard>[0]) {
  return renderToStaticMarkup(createElement(PomeloImportWizard, {
    model: importWizard(input),
    onNext: () => assert.fail("Rendering must not call onNext"),
    onClose: () => assert.fail("Rendering must not call onClose"),
  }));
}

test("shows each step in order with a word for its state and one current step", () => {
  const inputs = [
    { ...ready, extensionPaired: false },
    { ...ready, sourceProfile: "" },
    { ...ready, targetProfileId: "" },
    ready,
    { ...ready, run: finished },
  ];

  for (const [current, input] of inputs.entries()) {
    const html = render(input);
    const orderedList = html.match(/<ol\b[^>]*>(.*?)<\/ol>/s);
    assert.ok(orderedList);
    assert.equal(html.match(/aria-current="step"/g)?.length, 1);

    const items = Array.from(orderedList[1].matchAll(/<li\b([^>]*)>(.*?)<\/li>/gs));
    assert.equal(items.length, stepLabels.length);
    for (const [index, [, attributes, content]] of items.entries()) {
      const words = Array.from(content.matchAll(/>([^<>]+)</g), ([, text]) => text);
      assert.deepEqual(words, [stepLabels[index], index < current ? "Done" : index === current ? "Now" : "Later"]);
      assert.equal(attributes.includes('aria-current="step"'), index === current);
    }
  }
});

test("uses native buttons, displays the blocked reason and offers no next action during import", () => {
  const blocked = render({ ...ready, extensionPaired: false });
  assert.match(blocked, /Pair the Chrome companion extension\./);
  assert.match(blocked, /<button\b(?=[^>]*\btype="button")(?=[^>]*\bdisabled="")[^>]*>Continue<\/button>/);
  assert.match(blocked, /<button\b[^>]*\btype="button"[^>]*>Close<\/button>/);

  const available = render(ready);
  const next = available.match(/<button\b[^>]*\btype="button"[^>]*>Run import<\/button>/);
  assert.ok(next);
  assert.doesNotMatch(next[0], /\bdisabled="/);

  const running = render({ ...ready, run: { ...finished, endedAt: null } });
  assert.match(running, /Importing sites…/);
  assert.equal(running.match(/<button\b/g)?.length, 1);
  assert.match(running, /<button\b[^>]*>Close<\/button>/);
});

test("shows the all-imported headline and the result for each site", () => {
  const html = render({ ...ready, run: finished });
  assert.match(html, /role="status"[^>]*>All 2 sites imported<\//);
  assert.equal(html.match(/>Imported<\//g)?.length, 2);
  assert.equal(html.match(/<button\b/g)?.length, 1);
  assert.match(html, /<button\b[^>]*>Close<\/button>/);
});

test("partial results show each site's own label and tone, with completion words limited to steps", () => {
  const sites = [...ready.sites, "three.example.test", "אתר לדוגמה"];
  const html = render({
    ...ready,
    sites,
    run: {
      ...finished,
      sites: [
        { site: sites[0], result: "imported" },
        { site: sites[1], result: "expired" },
        { site: sites[2], result: "incompatible" },
        { site: sites[3], result: "unknown result" },
      ],
    },
  });

  const results = html.replace(/<ol\b[^>]*>.*?<\/ol>/s, "");
  assert.match(results, /role="status"[^>]*>1 of 4 imported · 1 expired · 1 incompatible · 1 skipped<\//);
  assert.doesNotMatch(results, /\b(?:done|complete)\b|All \d+ sites imported/i);

  const siteList = results.match(/<ul\b[^>]*>(.*?)<\/ul>/s);
  assert.ok(siteList);
  const rows = Array.from(siteList[1].matchAll(/<li\b[^>]*>(.*?)<\/li>/gs), ([, content]) => content);
  assert.deepEqual(rows.map((row) => Array.from(row.matchAll(/>([^<>]+)</g), ([, text]) => text)), [
    [sites[1], "Expired (sign in again in Chrome)", "Warning"],
    [sites[2], "Incompatible (device-bound)", "Error"],
    [sites[3], "Skipped", "Warning"],
    [sites[0], "Imported", "Success"],
  ]);
  assert.match(rows[0], /class="[^"]*text-\[var\(--amber\)\][^"]*"[^>]*>Warning<\//);
  assert.match(rows[1], /class="[^"]*text-\[var\(--red\)\][^"]*"[^>]*>Error<\//);
  assert.match(rows[2], /<bdi\b[^>]*\bdir="auto"[^>]*>אתר לדוגמה<\/bdi>/);
  assert.match(rows[3], /class="[^"]*text-\[var\(--green\)\][^"]*"[^>]*>Success<\//);
});

test("raw receipt fields never reach the markup in any canary form", () => {
  // Same synthetic fixture as the sweep tests, with distinct JSON and URL encodings.
  const canary = ["pomelo-canary", '7f"3\\a', "ÿÿÿ", "91c2e5"].join("-");
  const profiles = [{ id: canary, location: "local" as const, value: canary }];
  const run = {
    endedAt: finished.endedAt,
    targetProfileId: canary,
    sourceProfile: canary,
    value: canary,
    cookies: [{ name: canary, value: canary }],
    sites: [
      { site: ready.sites[0], result: canary, name: canary, value: canary, cookies: [{ value: canary }] },
      { site: canary, result: canary, name: canary, value: canary, cookies: [{ value: canary }] },
    ],
  };
  const input = { ...ready, sourceProfile: canary, targetProfileId: canary, profiles, run, value: canary };
  const markup = render(input);
  assertNoCanary(canary, { markup, unescapedQuotes: markup.replaceAll("&quot;", '"') });
  assert.match(markup, />Skipped<\//);
});
