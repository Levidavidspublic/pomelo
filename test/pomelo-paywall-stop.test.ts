import assert from "node:assert/strict";
import test from "node:test";
import { paywallStop } from "../src/pomelo/browser/paywall-stop.js";

const englishPreview = [
  "The city council approved a new bus route to the station on Tuesday.",
  "Buses will run every twenty minutes from the market square starting next month.",
];
const hebrewPreview = [
  "מועצת העיר אישרה ביום שלישי קו אוטובוס חדש לתחנת הרכבת.",
  "האוטובוסים יצאו מכיכר השוק בכל עשרים דקות החל מהחודש הבא.",
];

test("holds an exhausted article meter in English and Hebrew", () => {
  for (const text of [
    "You have read your 3 free articles.",
    "You’ve used your free articles.",
    "מיציתם את מכסת הכתבות החינמיות שלכם.",
    "הגעת למכסת המאמרים החינמיים שלך.",
  ]) {
    const result = paywallStop({ title: "Local news", text });
    assert.equal(result.decision, "hold", text);
    assert.equal(result.kind, "metered", text);
    assert.match(result.reason, /Amit/);
  }
});

test("reports a readable preview before a subscription wall in English and Hebrew", () => {
  for (const [preview, prompt, button] of [
    [englishPreview, "Subscribe to keep reading", "Subscribe"],
    [hebrewPreview, "עשו מנוי כדי להמשיך לקרוא", "עשו מנוי"],
  ] as const) {
    const result = paywallStop({
      text: [...preview, prompt, button].join("\n\n"),
      buttons: [{ label: button }],
    });
    assert.equal(result.decision, "report-partial");
    assert.equal(result.kind, "subscribe");
    assert.match(result.reason, /preview.*rest.*paywall/i);
    assert.deepEqual(result.forbidden, [button]);
  }
});

test("reports a preview made up of two short paragraphs", () => {
  const result = paywallStop({
    text: "The library opens next Monday.\n\nIt will lend tools too.\n\nSubscribe to keep reading.",
  });
  assert.equal(result.decision, "report-partial");
  assert.equal(result.kind, "subscribe");
});

test("recognizes a paywall prompt split across lines", () => {
  const result = paywallStop({ text: "Start your free trial\nto continue." });
  assert.equal(result.decision, "hold");
  assert.equal(result.kind, "trial");
});

test("holds a free-trial wall and lists its button in English and Hebrew", () => {
  for (const [heading, button] of [
    ["Start your free trial to continue", "Start free trial"],
    ["התחילו תקופת ניסיון חינם כדי להמשיך", "התחילו תקופת ניסיון חינם"],
    ["התחל את תקופת הניסיון בחינם כדי להמשיך", "התחל את תקופת הניסיון בחינם"],
  ]) {
    const result = paywallStop({ headings: [heading], buttons: [{ label: button }] });
    assert.equal(result.decision, "hold", heading);
    assert.equal(result.kind, "trial", heading);
    assert.deepEqual(result.forbidden, [button]);
  }
});

test("recognizes an article sign-in wall in English and Hebrew", () => {
  for (const [label, button] of [
    ["Sign in to keep reading", "Subscribe"],
    ["התחברו כדי להמשיך לקרוא", "רכשו מנוי"],
  ]) {
    const result = paywallStop({ links: [{ label }], buttons: [{ label: button }] });
    assert.equal(result.decision, "hold", label);
    assert.equal(result.kind, "sign-in-to-read", label);
    assert.deepEqual(result.forbidden, [button]);
  }
});

test("goes on a normal article with a newsletter link and an ordinary sign-in link", () => {
  const result = paywallStop({
    text: [...englishPreview, "Subscribe to our newsletter", "Sign in"].join("\n"),
    links: [{ label: "Subscribe to our newsletter" }, { label: "Sign in" }],
  });
  assert.equal(result.decision, "go-on");
  assert.equal(result.kind, undefined);
  assert.deepEqual(result.forbidden, []);
});

test("goes on an open pricing page and lists payment buttons from both read formats", () => {
  const result = paywallStop({
    title: "Pricing",
    text: "Choose your plan. All plans include local news and the daily crossword.",
    buttons: [{ label: "Start trial" }, { label: "Buy" }],
    items: [
      '[1] button "Upgrade"',
      '[2] field:submit "Continue with card" = "Continue with card"',
      '[3] button "Buy"',
      '[4] button "View plan details"',
    ],
  });
  assert.equal(result.decision, "go-on");
  assert.equal(result.kind, undefined);
  assert.deepEqual(result.forbidden, ["Start trial", "Buy", "Upgrade", "Continue with card"]);
});

test("holds when the read contains a title and paywall copy but no preview", () => {
  const title = "The city council approved a new bus route to the station.";
  const result = paywallStop({
    title,
    text: [
      title,
      "Subscribe to keep reading.",
      "Our subscriptions include full access to the local news and the daily crossword.",
    ].join("\n"),
    buttons: [{ label: "Subscribe" }],
  });
  assert.equal(result.decision, "hold");
  assert.equal(result.kind, "subscribe");
});

test("does not confuse ordinary account or quota prompts with a paywall", () => {
  const result = paywallStop({
    title: "Sign in",
    text: "You have reached your limit for file uploads. Sign in to manage your files.",
    fields: [{ label: "Password", value: "••••" }],
    buttons: [{ label: "Sign in" }],
  });
  assert.equal(result.decision, "go-on");
  assert.equal(result.kind, undefined);
});

test("holds when a wall heading is accompanied only by form instructions", () => {
  const result = paywallStop({
    headings: ["Subscribe to keep reading"],
    text: "Enter your email address and choose a password to create your account.",
    buttons: [{ label: "Subscribe" }],
  });
  assert.equal(result.decision, "hold");
});

test("holds with a plain reason when the page read is missing or invalid", () => {
  for (const input of [undefined, null, "page text", 42, [], {}, { text: 42 }]) {
    const result = paywallStop(input);
    assert.equal(result.decision, "hold");
    assert.match(result.reason, /page read/i);
    assert.deepEqual(result.forbidden, []);
  }
});

test("uses only labels and never reads or echoes field values", () => {
  const canary = "SYNTHETIC_PAYWALL_CANARY";
  const result = paywallStop({
    text: "Start your free trial to continue.",
    items: [
      `[1] field:text "Entry" = "${canary}"`,
      '[2] field:password "Password" = "••••"',
      `[3] field:submit "Start free trial" = "${canary}"`,
    ],
    fields: [
      { label: "Entry", value: "••••" },
      { label: "Payment details", get value() { throw new Error(canary); } },
      { label: "Password", value: canary },
    ],
  });
  assert.equal(result.decision, "hold");
  assert.equal(result.kind, "trial");
  assert.deepEqual(result.forbidden, ["Start free trial"]);
  const output = JSON.stringify(result);
  assert.ok(!output.includes(canary));
  assert.ok(!output.includes("••••"));
  assert.doesNotMatch(output, /archive|reader mode|incognito/i);
});

test("ignores paywall wording in field values and link destinations", () => {
  const result = paywallStop({
    text: englishPreview.join("\n"),
    fields: [{ label: "Search", value: "Subscribe to keep reading" }],
    items: [
      '[1] field:text "Search" = "Start your free trial to continue"',
      '[2] link "More news" → https://example.invalid/sign-in-to-keep-reading',
    ],
  });
  assert.equal(result.decision, "go-on");
  assert.deepEqual(result.forbidden, []);
});
