import assert from "node:assert/strict";
import test from "node:test";
import { MASK } from "../src/pomelo/mask.js";
import { overlayRule, type OverlayElement, type OverlayPageRead } from "../src/pomelo/browser/overlay-rule.js";

const neverPress = ["subscribe", "sign up", "allow", "accept", "continue", "get the app"];

function button(label: string, ref: number): OverlayElement {
  return { role: "button", label, ref };
}

function dialog(title: string, ...elements: OverlayElement[]): OverlayPageRead {
  return { overlay: { title, blocksPage: true, elements } };
}

function decide(read: unknown, closesOnThisPage?: number) {
  const decision = overlayRule(read, { closesOnThisPage });
  if (decision.action === "close") {
    const page = read as OverlayPageRead;
    const matches = page.overlay?.elements.filter(({ ref }) => ref === decision.ref) ?? [];
    assert.equal(matches.length, 1);
    assert.equal(matches[0].role, "button");
    assert.ok(!neverPress.includes(matches[0].label.trim().toLowerCase().replace(/\s+/g, " ")));
  } else {
    assert.ok(!("ref" in decision));
  }
  return decision;
}

test("leaves a readable page and a nonblocking overlay alone", () => {
  const read: OverlayPageRead = {
    title: "Garden guide",
    text: "Choose a plant\nSubscribe to our newsletter",
    items: ['[1] button "No thanks"'],
  };
  assert.deepEqual(decide(read, 2), { action: "none" });
  assert.deepEqual(decide({
    ...read,
    overlay: { title: "Newsletter", blocksPage: false, elements: [button("Close", 1)] },
  }), { action: "none" });
});

test("closes a newsletter with No thanks and leaves the email field and default Subscribe alone", () => {
  const email = { role: "textbox", label: "Email", ref: 4, value: MASK };
  const read = dialog("Newsletter", email, { ...button("Subscribe", 5), isDefault: true }, button("No thanks", 7));
  assert.deepEqual(decide({
    ...read,
    items: ['[2] button "Close"', `[4] field:email "Email" = ${MASK}`, '[5] button "Subscribe"', '[7] button "No thanks"'],
  }), { action: "close", ref: 7 });
});

test("closes a dialog with only an × button", () => {
  assert.deepEqual(decide(dialog("", button("×", 2))), { action: "close", ref: 2 });
});

test("holds an app-download sheet if its only button is Get the app", () => {
  const result = decide(dialog("Download the app", button("Get the app", 2)));
  assert.equal(result.action, "hold");
  assert.match(result.reason, /close button.*Amit/i);
});

test("uses Not now on a page's notification prompt", () => {
  const read = dialog("Allow notifications?", { ...button("Allow", 1), isDefault: true }, button("Not now", 2));
  assert.deepEqual(decide(read), { action: "close", ref: 2 });
});

test("holds a survey with two different close buttons", () => {
  const result = decide(dialog("Take our survey", button("Close", 1), button("Dismiss", 2)));
  assert.equal(result.action, "hold");
  assert.match(result.reason, /more than one.*Amit/i);
});

test("matches whole English and Hebrew close labels", () => {
  for (const label of ["Close", "Dismiss", "  NO\tTHANKS  ", "סגור", "לא תודה"]) {
    assert.deepEqual(decide(dialog("סקר", button(label, 3))), { action: "close", ref: 3 }, label);
  }
  for (const label of ["", MASK, "Close and continue", "No thanks, subscribe anyway"]) {
    assert.equal(decide(dialog("Survey", button(label, 1))).action, "hold", label);
  }
});

test("leaves cookie consent, sign-in, terms, CAPTCHAs and native dialogs to their own rules", () => {
  for (const read of [
    dialog("Cookie preferences", button("Accept", 1), button("Close", 2)),
    dialog("Your privacy", button("Accept all cookies", 1), button("Close", 2)),
    dialog("Welcome back", button("Sign in", 1), button("Dismiss", 2)),
    dialog("Updated terms", button("Accept", 1), button("Close", 2)),
    dialog("Verify you are human", button("Close", 2)),
    dialog("One more step", { role: "checkbox", label: "I'm not a robot", ref: 1 }, button("Close", 2)),
    dialog("Verify you're human", button("Close", 2)),
    { title: "Terms of Service", items: ['[1] button "Continue"'] },
    { ...dialog("Allow notifications?", button("Not now", 2)), browserDialog: true },
  ]) {
    assert.deepEqual(decide(read, 2), { action: "none", otherRule: true });
  }
});

test("uses the overlay's own wording instead of footer links or background text", () => {
  const read = {
    title: "Garden guide",
    text: "Sign in\nTerms of Service\nPrivacy Policy",
    overlay: {
      title: "Newsletter",
      text: "See our Privacy Policy.",
      blocksPage: true,
      elements: [button("No thanks", 2)],
    },
  };
  assert.deepEqual(decide(read), { action: "close", ref: 2 });
  assert.deepEqual(decide({ ...read, overlay: { ...read.overlay, title: "Welcome", text: "We use cookies." } }), {
    action: "none", otherRule: true,
  });
});

test("holds the third overlay on the same page", () => {
  const read = dialog("Survey", button("Dismiss", 1));
  assert.deepEqual(decide(read, 0), { action: "close", ref: 1 });
  assert.deepEqual(decide(read, 1), { action: "close", ref: 1 });
  const result = decide(read, 2);
  assert.equal(result.action, "hold");
  assert.match(result.reason, /twice.*Amit/i);
});

test("holds when the page read is missing, empty or malformed", () => {
  for (const read of [undefined, null, [], "Newsletter", 1, {}, { text: " \n", items: [] }, { overlay: {} }]) {
    assert.deepEqual(decide(read), { action: "hold", reason: "page not readable" });
  }
});

test("never selects a text box or any default button on the never-press list", () => {
  const textbox = { label: "Close", role: "textbox", ref: 1, value: MASK };
  for (const label of neverPress) {
    const primary = { ...button(label.toUpperCase(), 2), isDefault: true };
    assert.equal(decide(dialog("Newsletter", textbox, primary)).action, "hold", label);
    assert.deepEqual(decide(dialog("Newsletter", textbox, primary, button("Close", 3))), { action: "close", ref: 3 });
  }
});

test("holds if a close reference is duplicated, disagrees with the numbered read, or is unusable", () => {
  const read = dialog("Newsletter", button("Close", 1));
  assert.equal(decide(dialog("Newsletter", button("Close", 1), button("Subscribe", 1))).action, "hold");
  for (const item of ['[1] field:text "Close"', '[1] button "Subscribe"', '[2] button "Close"']) {
    assert.equal(decide({ ...read, items: [item] }).action, "hold");
  }
  assert.equal(decide(dialog("Newsletter", button("Close", 0))).action, "hold");
  assert.equal(decide(dialog("Newsletter", { ...button("Close", 1), disabled: true })).action, "hold");
});

test("ignores field values and keeps them out of results", () => {
  for (const label of ["No thanks", "Subscribe"]) {
    const read = (value: string) => {
      const field = { label: "Email", role: "textbox", ref: 1, value };
      return dialog("Newsletter", field, button(label, 2));
    };
    const empty = decide(read(""));
    const masked = decide(read(MASK));
    assert.equal(masked.action, label === "No thanks" ? "close" : "hold");
    assert.deepEqual(masked, empty);
    assert.ok(!JSON.stringify(masked).includes(MASK));
    const sample = "SYNTHETIC_OVERLAY_FIELD";
    let valueRead = false;
    const field = {
      label: "Email", role: "textbox", ref: 1,
      get value(): string {
        valueRead = true;
        return sample;
      },
    };
    const withUnreadValue = decide(dialog("Newsletter", field, button(label, 2)));
    assert.equal(valueRead, false);
    assert.deepEqual(withUnreadValue, empty);
    assert.ok(!JSON.stringify(withUnreadValue).includes(sample));
  }
});
