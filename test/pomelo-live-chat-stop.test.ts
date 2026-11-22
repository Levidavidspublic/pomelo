import assert from "node:assert/strict";
import test from "node:test";
import { MASK } from "../src/pomelo/mask.js";
import { HIDDEN } from "../src/secrets.js";
import { liveChatStop, type LiveChatPageRead } from "../src/pomelo/browser/live-chat-stop.js";

const mayNot = [
  "type a message",
  "press start chat",
  "press send",
  "press request a call",
  "give a phone number or email",
];

function decide(read?: unknown) {
  const result = liveChatStop(read);
  assert.deepEqual(result.mayNot, mayNot);
  if (result.kind) assert.ok(result.reason.includes(result.kind));
  if (result.action !== "close") assert.ok(!("closeTarget" in result));
  return result;
}

function invite(...buttons: NonNullable<LiveChatPageRead["buttons"]>): LiveChatPageRead {
  return { dialogs: [{ title: "Chat with an agent", buttons: [{ label: "Start chat" }, ...buttons] }] };
}

test("holds an open chat even when it has a close button", () => {
  const canary = "SYNTHETIC_CHAT_TEXT";
  const result = decide({ dialogs: [{
    title: "Chat with us",
    text: `You are now chatting with support. ${canary}`,
    inputs: [{ type: "textarea", placeholder: "Type your message", value: MASK }],
    buttons: [{ label: "Send" }, { id: "dismiss", label: "Close" }],
  }] });
  assert.equal(result.action, "hold");
  assert.equal(result.kind, "chat-open");
  assert.ok(!JSON.stringify(result).includes(canary));
});

test("recognizes an open chat in a flat read", () => {
  for (const read of [
    { title: "Live support chat", inputs: [{ label: "Message", type: "text" }] },
    { items: ['[1] field:textarea "Type your message"', '[2] button "Send"'] },
  ]) {
    const result = decide(read);
    assert.equal(result.action, "hold");
    assert.equal(result.kind, "chat-open");
  }
});

test("returns the only clear close target for a chat invite", () => {
  for (const label of ["Close", "×", " NO THANKS ", "סגור"]) {
    const result = decide(invite({ id: "dismiss", label }));
    assert.equal(result.action, "close");
    assert.equal(result.kind, "chat-invite");
    assert.equal(result.closeTarget, "dismiss");
  }
  const flat = decide({
    text: "Chat with us",
    buttons: [{ id: 1, label: "Start chat" }, { id: 2, label: "Close" }],
  });
  assert.equal(flat.action, "close");
  assert.equal(flat.closeTarget, 2);
});

test("holds invites with missing, disabled, ambiguous, or non-close targets", () => {
  for (const read of [
    invite(),
    invite({ id: "first", label: "Close" }, { id: "second", label: "×" }),
    invite({ id: "dismiss", label: "Close", disabled: true }),
    invite({ label: "Close" }),
    invite({ id: "dismiss", label: "Close and send" }),
    invite({ id: "same", label: "Close" }, { id: "same", label: "Send" }),
    { ...invite(), buttons: [{ id: "outside", label: "Close" }] },
    { text: "Chat with us", dialogs: [{ title: "Newsletter", buttons: [{ id: "outside", label: "Close" }] }] },
    { buttons: [{ id: "open", label: "Start chat" }, { id: "outside", label: "Close" }] },
    { dialogs: [{ title: "Chat with us", blocksPage: false, buttons: [{ id: "dismiss", label: "Close" }] }] },
  ]) {
    const result = decide(read);
    assert.equal(result.action, "hold");
    assert.equal(result.kind, "chat-invite");
  }
});

test("checks that a numbered close target names the same button", () => {
  const read = invite({ id: 2, label: "Close" });
  assert.equal(decide({ ...read, items: ['[2] button "Close"'] }).closeTarget, 2);
  for (const items of [
    ['[2] link "Close"'], ['[2] button "Send"'], ['[2] button "Close"', '[2] button "Send"'],
  ]) assert.equal(decide({ ...read, items }).action, "hold");
});

test("holds a call-back request even when a chat invite can be closed", () => {
  for (const read of [
    { title: "Request a call back", inputs: [{ label: "Phone number", type: "tel" }] },
    { ...invite({ id: "dismiss", label: "Close" }), text: "We will call you." },
    { buttons: [{ id: "call", label: "Request a call" }] },
  ]) {
    const result = decide(read);
    assert.equal(result.action, "hold");
    assert.equal(result.kind, "call-request");
  }
});

test("recognizes Hebrew chat panels, invites, and call-back requests", () => {
  const open = decide({
    title: "צ׳אט עם נציג",
    inputs: [{ type: "textarea", placeholder: "הקלידו את ההודעה שלכם" }],
    buttons: [{ label: "שלח" }],
  });
  assert.equal(open.action, "hold");
  assert.equal(open.kind, "chat-open");

  const invitation = decide({ dialogs: [{ text: "שוחחו עם נציג", buttons: [
    { label: "התחל צ'אט" }, { id: "dismiss", label: "סָגוֹר" },
  ] }] });
  assert.equal(invitation.action, "close");
  assert.equal(invitation.kind, "chat-invite");
  assert.equal(invitation.closeTarget, "dismiss");

  for (const text of ["נחזור אליך", "בקשה לשיחה חוזרת"]) {
    const call = decide({ dialogs: [{ text }] });
    assert.equal(call.action, "hold");
    assert.equal(call.kind, "call-request");
  }
});

test("goes on when the page offers only navigation or an unrelated overlay", () => {
  for (const read of [
    { items: ['[1] link "Contact us"'] },
    { title: "Help centre", text: "Contact us\nHelp centre", items: ['[1] link "Help centre"'] },
    { title: "Help centre", text: "Chat with us", items: ['[1] link "Chat with us"'] },
    { title: "Help centre", text: "Chat with us", links: [{ label: "Chat with us" }] },
    { dialogs: [{ title: "Subscribe to our newsletter", inputs: [{ label: "Email", type: "email" }],
      buttons: [{ id: "dismiss", label: "No thanks" }] }] },
    { dialogs: [{ title: "Download the app", buttons: [
      { label: "Get the app" }, { id: "dismiss", label: "Close" },
    ] }] },
  ]) assert.equal(decide(read).action, "go-on");
});

test("ignores masked wording and does not read field values or link destinations", () => {
  for (const marker of [MASK, HIDDEN]) {
    assert.equal(decide({ title: marker }).action, "hold");
    assert.equal(decide({ title: "Help center", text: `Start ${marker} chat`, items: [
      `[1] link "Contact us" → Start chat`, `[2] field:text "Search" = ${marker}`,
    ] }).action, "go-on");
    assert.equal(decide(invite({ id: "dismiss", label: marker })).action, "hold");
  }
  const read = { title: "Help centre", inputs: [{ label: "Search", get value(): string {
    return assert.fail("The rule should not access an input value");
  } }] };
  assert.equal(decide(read).action, "go-on");
});

test("holds unreadable or malformed page reads", () => {
  for (const read of [undefined, null, [], "Start chat", {}, { text: "  ", dialogs: [] }, { title: 42 },
    { text: "Help centre", buttons: [null] }, { inputs: [{ placeholder: false }] },
    { dialogs: [{ buttons: "Close" }] }, { items: ["unreadable"] }]) {
    const result = decide(read);
    assert.equal(result.action, "hold");
    assert.match(result.reason, /read/i);
  }
});
