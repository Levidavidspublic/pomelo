import assert from "node:assert/strict";
import test from "node:test";
import { externalAppRule } from "../src/pomelo/browser/external-app-rule.js";

test("web addresses and the blank page go to the navigation rule", () => {
  for (const address of ["https://site.example/docs", "http://site.example", "about:blank"]) {
    const decision = externalAppRule({ address });
    assert.equal(decision.action, "go");
    assert.equal(decision.label, undefined);
  }
});

test("external schemes are refused and normalized", () => {
  for (const [address, scheme] of [
    ["mailto:placeholder", "mailto"],
    ["tel:placeholder", "tel"],
    ["sms:placeholder", "sms"],
    ["facetime:placeholder", "facetime"],
    ["zoommtg://meeting.example/join", "zoommtg"],
    ["msteams:placeholder", "msteams"],
    ["slack:placeholder", "slack"],
    ["spotify:placeholder", "spotify"],
    ["intent://meeting.example/join#Intent;scheme=https;end", "intent"],
    ["market:placeholder", "market"],
    ["itms-apps:placeholder", "itms-apps"],
    ["ms-windows-store:placeholder", "ms-windows-store"],
    ["vscode:placeholder", "vscode"],
    ["myapp:placeholder", "myapp"],
    ["ZOOMMTG://meeting.example/join", "zoommtg"],
  ]) {
    const decision = externalAppRule({ address });
    assert.equal(decision.action, "refuse", scheme);
    assert.equal(decision.scheme, scheme);
    assert.equal(decision.label, undefined);
  }
});

test("an invalid address or unreadable page holds the job", () => {
  for (const input of [{ address: "not an address" }, { pageRead: {} }, {}]) {
    const decision = externalAppRule(input);
    assert.equal(decision.action, "hold");
    assert.deepEqual(decision.signals, []);
  }
});

test("a handoff page can offer one clear browser choice in English or Hebrew", () => {
  for (const [title, label] of [
    ["Open in the app?", "Join from your browser"],
    ["Launching…", "Use the web version"],
    ["Click Open if you see the system dialog", "Stay on web"],
    ["לפתוח באפליקציה?", "הצטרפו דרך הדפדפן"],
    ["פותח את האפליקציה…", "המשך בדפדפן"],
    ["הפעלת היישום", "השתמשו בגרסת האינטרנט"],
    ["לחצו על ״פתח״ אם מופיעה תיבת הדו־שיח", "הישארו באתר"],
  ]) {
    const decision = externalAppRule({
      address: "https://meeting.example/join",
      pageRead: { title, items: [`[1] link "${label}" → https://meeting.example/web`] },
    });
    assert.equal(decision.action, "press");
    assert.equal(decision.label, label);
  }
});

test("app actions never displace the single browser choice", () => {
  const decision = externalAppRule({
    pageRead: {
      text: "Launching…",
      items: [
        '[1] button "Open app"',
        '[2] button "Open"',
        '[3] button "Launch"',
        '[4] button "Download"',
        '[5] button "Install"',
        '[6] button "Get the app"',
        '[7] button "Continue in browser"',
      ],
    },
  });
  assert.equal(decision.action, "press");
  assert.equal(decision.label, "Continue in browser");
});

test("a handoff page with missing or ambiguous browser choices holds", () => {
  for (const items of [
    ['[1] button "Open app"', '[2] button "Download"'],
    ['[1] button "Continue in browser"', '[2] link "Use the web version"'],
    ['[1] button "Continue in browser"', '[2] button "Continue in browser"'],
    ['[1] field:text "Continue in browser"'],
    ['[1] link "Continue in browser" → zoommtg://meeting.example/join'],
  ]) {
    const decision = externalAppRule({ pageRead: { text: "Open in the app?", items } });
    assert.equal(decision.action, "hold");
    assert.equal(decision.label, undefined);
  }
});

test("ordinary page controls and prose do not trigger the handoff rule", () => {
  const decision = externalAppRule({
    pageRead: {
      title: "Launching a new product",
      text: "Open the product details.",
      items: ['[1] button "Open"', '[2] link "Continue in browser"'],
    },
  });
  assert.equal(decision.action, "go");
});

test("decisions omit address payloads, page text, and arbitrary labels", () => {
  const marker = "external-app-test-canary";
  const pageRead = {
    title: `Open in the app? ${marker}`,
    text: marker,
    items: [`[1] button "Continue in browser ${marker}"`],
  };
  const addressDecision = externalAppRule({ address: `mailto:${marker}`, pageRead });
  assert.equal(addressDecision.action, "refuse");
  assert.equal(addressDecision.scheme, "mailto");
  assert.equal(JSON.stringify(addressDecision).includes(marker), false);

  const pageDecision = externalAppRule({ pageRead });
  assert.equal(pageDecision.action, "hold");
  assert.equal(JSON.stringify(pageDecision).includes(marker), false);
});
