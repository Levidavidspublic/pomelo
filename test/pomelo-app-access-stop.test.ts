import assert from "node:assert/strict";
import test from "node:test";
import { appAccessStop, type AppAccessPageRead } from "../src/pomelo/browser/app-access-stop.js";

test("holds explicit account-access wording in English and Hebrew without an approval button", () => {
  for (const read of [
    { title: "This app wants to access your Google Account", text: "You are signed in. Welcome back." },
    { text: "The app is requesting permission to read your email." },
    { title: "Authorize application" },
    { title: "Authorize Example Planner" },
    { title: "Authorize “Example Planner”" },
    { text: "This will allow Example Planner to manage your calendar." },
    { text: "The site is requesting permission to send notifications. The app is requesting permission to read your email." },
    { text: "האפליקציה מְבַקֶּשֶׁת גישה לחשבון שלך." },
    { text: "האפליקציה מבקשת הרשאה לקרוא את הדואר האלקטרוני שלך." },
    { text: "האפליקציה מבקשת את ההרשאה לקרוא את הדואר האלקטרוני שלך." },
    { title: "אישור גישה" },
    { text: "פעולה זו תאפשר לאפליקציה לנהל את היומן שלך." },
  ]) {
    const result = appAccessStop(read);
    assert.equal(result.action, "hold", JSON.stringify(read));
    assert.match(result.reason, /^[^.!?\n]+Amit[^.!?\n]+\.$/);
    assert.ok(result.signals.includes("access-wording"));
  }
});

test("holds account permission lists with an approval button in English and Hebrew", () => {
  for (const [text, labels] of [
    ["Read your email\nSee your contacts\nAct on your behalf", ["Allow", "Authorize", "Grant", "Continue"]],
    ["לקרוא את הדואר האלקטרוני שלך\nלראות את אנשי הקשר שלך\nלפעול בשמך", ["אפשר", "אישור גישה", "הענק גישה", "המשך"]],
  ] as const) {
    for (const label of labels) {
      const result = appAccessStop({ text, buttons: [{ label }] });
      assert.equal(result.action, "hold", label);
      assert.ok(result.signals.includes("permission-list"));
      assert.ok(result.signals.includes("allow-button"));
    }
  }
});

test("holds when only the approval button's nearby text describes access", () => {
  for (const [label, nearbyText] of [
    ["Allow", "Example Planner wants to access\n your account."],
    ["אפשר", "האפליקציה מבקשת גישה לחשבון שלך."],
  ]) {
    const result = appAccessStop({ title: "Review", buttons: [{ label, nearbyText }] });
    assert.equal(result.action, "hold");
    assert.deepEqual(result.signals, ["access-wording", "allow-button"]);
  }
});

test("holds page permission lists when approval button context is empty or unrelated", () => {
  for (const [label, permissions, unrelated] of [
    ["Allow", ["Read your email", "See your contacts"], "Cancel"],
    ["אפשר", ["לקרוא את הדואר האלקטרוני שלך", "לראות את אנשי הקשר שלך"], "ביטול"],
  ] as const) {
    for (const nearbyText of ["", unrelated]) {
      const buttons = [{ label, nearbyText }];
      for (const read of [
        { text: permissions.join("\n"), buttons },
        { checkboxes: permissions.map((label) => ({ label, checked: false })), buttons },
      ]) {
        const result = appAccessStop(read);
        assert.equal(result.action, "hold", JSON.stringify(read));
        assert.deepEqual(result.signals, ["permission-list", "allow-button"]);
      }
    }
  }
});

test("recognizes approval buttons from Friday's numbered items", () => {
  const text = "Read your email\nSee your contacts";
  const result = appAccessStop({ text, items: ['[1] field:submit "Continue" = Continue'] });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["permission-list", "allow-button"]);
  assert.equal(appAccessStop({
    text,
    items: ['[1] field:text "Search" = Authorize application', '[2] link "Help" → https://example.invalid/allow'],
  }).action, "go");
});

test("holds with pre-ticked extra permissions and recognizes scopes in checkbox labels", () => {
  for (const [label, first, extra] of [
    ["Continue", "Read your email", "See your contacts"],
    ["המשך", "לקרוא את המייל שלך", "לראות את אנשי הקשר שלך"],
  ]) {
    const result = appAccessStop({
      checkboxes: [{ label: first, checked: false }, { label: extra, checked: true }],
      buttons: [{ label }],
    });
    assert.equal(result.action, "hold");
    assert.deepEqual(result.signals, ["permission-list", "allow-button", "extra-permissions"]);
  }
});

test("gives go on cookie, terms, account-chooser, and browser permission prompts", () => {
  const reads: AppAccessPageRead[] = [
    { text: "We use cookies. This will allow Example Metrics to store cookies.", buttons: [{ label: "Allow all" }] },
    { text: "אנו משתמשים בעוגיות כדי לשפר את האתר.", buttons: [{ label: "אפשר הכול" }] },
    { title: "Terms of Service", text: "Please accept our terms.", buttons: [{ label: "Continue" }] },
    { title: "תנאי השימוש", text: "יש לאשר את התנאים כדי להמשיך.", buttons: [{ label: "המשך" }] },
    { title: "Choose an account", items: ['[1] button "Example profile"'], buttons: [{ label: "Continue" }] },
    { title: "בחירת חשבון", items: ['[1] button "חשבון לדוגמה"'], buttons: [{ label: "המשך" }] },
    { text: "Allow notifications?", buttons: [{ label: "Allow" }, { label: "Not now" }] },
    { text: "This site is requesting permission to send notifications.", buttons: [{ label: "Allow" }] },
    { text: "לאפשר התראות?", buttons: [{ label: "אפשר" }, { label: "לא עכשיו" }] },
    { text: "האתר מבקש הרשאה לשלוח התראות.", buttons: [{ label: "אפשר" }] },
    { text: "האתר מבקש את ההרשאה לשלוח התראות.", buttons: [{ label: "אפשר" }] },
    { text: "פעולה זו תאפשר לאתר לשלוח לך התראות.", buttons: [{ label: "אפשר" }] },
  ];
  for (const read of reads) {
    const result = appAccessStop(read);
    assert.equal(result.action, "go", JSON.stringify(read));
    assert.deepEqual(result.signals, []);
  }
});

test("gives go for already connected apps with only removal buttons", () => {
  for (const [title, text, label] of [
    ["Connected apps", "Example Planner can read your email and see your contacts.", "Remove"],
    ["יישומים מחוברים", "האפליקציה יכולה לקרוא את הדואר האלקטרוני שלך ולראות את אנשי הקשר שלך.", "הסר"],
  ]) {
    const result = appAccessStop({ title, text, buttons: [{ label }] });
    assert.equal(result.action, "go");
    assert.deepEqual(result.signals, []);
  }
});

test("uses explicit button context when unrelated page text lists permissions", () => {
  const result = appAccessStop({
    title: "Connected apps",
    text: "Example Planner can read your email and see your contacts.",
    buttons: [{ label: "Remove" }, { label: "Allow", nearbyText: "Allow notifications?" }],
    items: ['[1] button "Allow"'],
  });
  assert.equal(result.action, "go");
});

test("defers approval buttons with explicit context for other prompts in English and Hebrew", () => {
  for (const [text, label, nearbyText] of [
    ["Read your email", "Allow", "We use cookies."],
    ["Read your email", "Allow", "Allow cookies?"],
    ["Read your email", "Continue", "Terms of Service"],
    ["Read your email", "Continue", "By continuing, you agree to the Terms of Service."],
    ["לקרוא את המייל שלך", "אפשר", "אנו משתמשים בעוגיות."],
    ["לקרוא את המייל שלך", "אפשר", "לאפשר עוגיות?"],
    ["לקרוא את המייל שלך", "המשך", "תנאי השימוש"],
    ["לקרוא את המייל שלך", "אפשר", "לאפשר התראות?"],
  ]) {
    const result = appAccessStop({ text, buttons: [{ label, nearbyText }] });
    assert.equal(result.action, "go", nearbyText);
    assert.deepEqual(result.signals, []);
  }
});

test("holds when approval button context lists account permissions alongside another prompt", () => {
  const result = appAccessStop({ buttons: [{ label: "Allow", nearbyText: "Allow notifications?\nRead your email" }] });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["permission-list", "allow-button"]);
});

test("holds unreadable or wrongly typed masked reads", () => {
  for (const read of [
    undefined, null, [], "Allow", {}, { text: " " },
    { title: 42 }, { text: null }, { buttons: "Allow" }, { buttons: [null] },
    { buttons: [{ label: false }] }, { buttons: [{ label: "Allow", nearbyText: 42 }] },
    { checkboxes: [{ label: "Read your email" }] }, { checkboxes: [{ label: 42, checked: true }] },
    { checkboxes: [{ label: "Read your email", checked: "true" }] },
    { items: [42] }, { items: Array<string>(1) },
  ]) {
    const result = appAccessStop(read);
    assert.equal(result.action, "hold");
    assert.match(result.reason, /^[^.!?\n]+\.$/);
    assert.deepEqual(result.signals, []);
  }
});

test("keeps a synthetic canary in the title, text, checkbox label, and button label out of the result", () => {
  const canary = "SYNTHETIC_ACCESS_CANARY";
  const result = appAccessStop({
    title: `Authorize ${canary}`,
    text: `${canary} wants to access your account.`,
    checkboxes: [{ label: `Read your email (${canary})`, checked: true }],
    buttons: [{ label: `Authorize ${canary}` }],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["access-wording", "permission-list", "allow-button", "extra-permissions"]);
  assert.ok(!JSON.stringify(result).includes(canary));
});
