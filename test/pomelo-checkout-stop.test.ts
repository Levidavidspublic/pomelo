import assert from "node:assert/strict";
import test from "node:test";
import { checkoutStop, type CheckoutPageRead } from "../src/pomelo/browser/checkout-stop.js";

test("holds card number, expiry, and security code fields in English and Hebrew", () => {
  for (const label of [
    "Card number", "Expiration date", "Security code (CVV)",
    "מִסְפַּר כרטיס", "תוקף הכרטיס", "תאריך תפוגה", "קוד אבטחה",
  ]) {
    const result = checkoutStop({ fields: [{ label }] });
    assert.equal(result.action, "hold", label);
    assert.deepEqual(result.signals, ["card-field"]);
    assert.match(result.reason, /Amit/);
  }
});

test("holds card fields identified only by their autocomplete kind", () => {
  for (const kind of ["cc-number", "section-payment cc-exp-month", "cc-exp-year", "cc-exp", "cc-csc"]) {
    const result = checkoutStop({ fields: [{ label: "Details", kind }] });
    assert.equal(result.action, "hold", kind);
    assert.deepEqual(result.signals, ["card-field"]);
  }
});

test("holds a page that asks for a billing address", () => {
  const fixtures: CheckoutPageRead[] = [
    { fields: [{ label: "Billing address" }] },
    { fields: [{ label: "כתובת לחיוב" }] },
    { fields: [{ label: "Street", kind: "section-payment billing address-line1" }] },
    { text: "Enter your billing address" },
    { text: "הזינו כתובת לחיוב" },
  ];
  for (const read of fixtures) {
    const result = checkoutStop(read);
    assert.equal(result.action, "hold");
    assert.deepEqual(result.signals, ["billing-address"]);
  }
});

test("holds saved-card choosers in English and Hebrew", () => {
  const fixtures: CheckoutPageRead[] = [
    { title: "Choose a saved card", buttons: [{ label: "Card ending in ••••" }] },
    { fields: [{ label: "Saved cards", kind: "select" }] },
    { text: "בחרו כרטיס שמור", buttons: [{ label: "כרטיס שמסתיים ב־••••" }] },
    { buttons: [{ label: "השתמש בכרטיס שמור" }] },
  ];
  for (const read of fixtures) {
    const result = checkoutStop(read);
    assert.equal(result.action, "hold");
    assert.deepEqual(result.signals, ["saved-card"]);
  }
});

test("holds when an order total is next to a purchase button", () => {
  for (const [nearbyText, labels] of [
    ["Order total: $28", ["Pay", "Pay now", "Place order", "Buy now", "Confirm purchase"]],
    ["סה״כ לתשלום: ₪28", ["לתשלום", "שלם עכשיו", "בצע הזמנה", "בצעו את ההזמנה", "קנה עכשיו", "אשר רכישה"]],
  ] as const) {
    for (const label of labels) {
      const result = checkoutStop({ buttons: [{ label, nearbyText }] });
      assert.equal(result.action, "hold", label);
      assert.deepEqual(result.signals, ["pay-button", "order-total"]);
    }
  }
});

test("uses numbered controls and nearby lines from Friday's read", () => {
  assert.deepEqual(checkoutStop({ items: ['[1] field:text "Card number" = ••••'] }).signals, ["card-field"]);
  assert.deepEqual(checkoutStop({ items: ['[1] select "כרטיסים שמורים"'] }).signals, ["saved-card"]);

  const result = checkoutStop({
    text: "Review order\nOrder total: $28\nPlace order",
    items: ['[1] field:submit "Place order" = ••••'],
  });
  assert.equal(result.action, "hold");
  assert.deepEqual(result.signals, ["pay-button", "order-total"]);
  assert.equal(checkoutStop({ text: "סה״כ לתשלום: ₪28", buttons: [{ label: "לתשלום" }] }).action, "hold");
});

test("goes on product, basket, price list, and footer pages in English and Hebrew", () => {
  const fixtures: CheckoutPageRead[] = [
    { title: "Notebook", text: "Price: $8", buttons: [{ label: "Buy now" }] },
    { title: "מחברת", text: "מחיר: ₪8", buttons: [{ label: "קנה עכשיו" }] },
    { title: "Basket", text: "Order total: $8", buttons: [{ label: "Continue shopping" }, { label: "View basket" }] },
    { title: "סל קניות", text: "סה״כ לתשלום: ₪8", buttons: [{ label: "המשך לקנות" }, { label: "צפה בסל" }] },
    { title: "Price list", text: "Notebook: $8\nPencil: $2\nTotal: $10" },
    { title: "מחירון", text: "מחברת: ₪8\nעיפרון: ₪2\nסה״כ: ₪10" },
    { title: "Home", text: "About · Contact · Payment methods", items: ['[1] link "Payment methods"'] },
    { title: "דף הבית", text: "אודות · צור קשר · אמצעי תשלום", items: ['[1] link "אמצעי תשלום"'] },
  ];
  for (const read of fixtures) {
    const result = checkoutStop(read);
    assert.equal(result.action, "go", read.title);
    assert.deepEqual(result.signals, []);
  }
});

test("goes on payment news with a Pay button and no checkout evidence", () => {
  for (const [text, label] of [
    ["How online payments work and where to find saved cards.", "Pay"],
    ["כתבה על תשלומים באינטרנט וכרטיסים שמורים.", "לתשלום"],
  ]) {
    assert.equal(checkoutStop({ text, buttons: [{ label }] }).action, "go");
  }
});

test("uses explicit button context and ignores values and destinations after numbered labels", () => {
  assert.equal(checkoutStop({
    text: "Order total: $28\nPay now",
    buttons: [{ label: "Pay now", nearbyText: "Payment news" }],
    items: ['[1] button "Pay now"'],
  }).action, "go");
  assert.equal(checkoutStop({
    text: "Order total: $28",
    items: ['[1] field:text "Search" = card number', '[2] link "Learn more" → Price list', '[3] link "Pay now"'],
  }).action, "go");
});

test("goes when the purchase button is far from the order total in the flat read", () => {
  assert.equal(checkoutStop({
    text: "Order total: $28\nOrder history\nDelivered\nPayment news\nAbout this service\nPay",
    buttons: [{ label: "Pay" }],
  }).action, "go");
});

test("holds when the masked read is empty or has wrongly typed parts", () => {
  for (const read of [
    undefined, null, "Checkout", [], {}, { title: 5 }, { text: null }, { fields: "Card number" },
    { fields: [{ kind: "cc-number" }] }, { fields: [{ label: "Details", kind: 4 }] },
    { fields: new Array(1) }, { buttons: [null] }, { buttons: [{ label: 7 }] },
    { buttons: [{ label: "Pay", nearbyText: false }] }, { items: [4] },
  ]) {
    const result = checkoutStop(read);
    assert.equal(result.action, "hold");
    assert.match(result.reason, /^[^.!?\n]+\.$/);
    assert.match(result.reason, /page read/i);
    assert.deepEqual(result.signals, []);
  }
});

test("keeps synthetic canaries out of every part of the decision", () => {
  const canary = "SYNTHETIC_CHECKOUT_CANARY";
  const result = checkoutStop({
    title: canary,
    text: canary,
    fields: [{ label: `Card number (${canary})` }],
    buttons: [{ label: `Pay now (${canary})` }],
  });
  assert.equal(result.action, "hold");
  assert.ok(!result.reason.includes(canary));
  assert.ok(result.signals.every((signal) => !signal.includes(canary)));
  assert.ok(!JSON.stringify(result).includes(canary));
});
