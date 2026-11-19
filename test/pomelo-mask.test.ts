import assert from "node:assert/strict";
import test from "node:test";
import { readOutput } from "../src/browser-driver.js";
import { MASK, maskAnswer, maskField, maskText, maskTree } from "../src/pomelo/mask.js";
import { HIDDEN } from "../src/secrets.js";

const canary = "FAKE-POMELO-MASK-CANARY";
const known = Object.freeze([canary]);

test("the planted canary disappears from page reads, field values, the accessibility tree and the answer", () => {
  const page = Object.freeze({
    title: "Example page",
    url: `https://example.invalid/?lookup=${canary}`,
    text: `Page text contains ${canary}`,
    cut: false,
    items: Object.freeze([`[1] Item label ${canary}`]),
    fields: Object.freeze([Object.freeze({ name: "lookup", type: "text", value: canary, filledByBroker: true })]),
    accessibility: Object.freeze({ children: Object.freeze([{ role: "group", children: [{ role: "text", name: canary }] }]) }),
  });
  const answer = {
    output: readOutput({ ...page, items: [...page.items] }),
    content: [{ type: "text", text: `${page.text}\n${page.url}` }],
    isError: false,
  };

  const snapshot = maskTree(page, known);
  const maskedAnswer = maskAnswer(answer, known);
  for (const result of [maskField(page.fields[0]), maskText(page.text, known), snapshot, maskedAnswer]) {
    assert.ok(!JSON.stringify(result).includes(canary));
  }
  assert.deepEqual(snapshot, {
    ...page,
    url: `https://example.invalid/?lookup=${MASK}`,
    text: `Page text contains ${MASK}`,
    items: [`[1] Item label ${MASK}`],
    fields: [{ ...page.fields[0], value: MASK }],
    accessibility: { children: [{ role: "group", children: [{ role: "text", name: MASK }] }] },
  });
  assert.equal(maskedAnswer.output, answer.output.replaceAll(canary, MASK));
  assert.deepEqual(maskedAnswer.content, [{ type: "text", text: `${snapshot.text}\n${snapshot.url}` }]);
  assert.equal(maskedAnswer.isError, false);
  assert.equal(page.fields[0].value, canary);
  assert.ok(JSON.stringify(answer).includes(canary));
  assert.deepEqual(maskTree(snapshot, known), snapshot);
  assert.deepEqual(maskAnswer(maskedAnswer, known), maskedAnswer);
});

test("Friday's secret-field rules and broker fills hide the value and preserve the field metadata", () => {
  assert.equal(MASK, "••••");
  const ordinary = { name: "search", type: "text", value: "example" };
  const fields = [
    { ...ordinary, type: "PASSWORD" },
    { ...ordinary, autocomplete: "section-login one-time-code" },
    { ...ordinary, name: "card-number" },
    { ...ordinary, filledByBroker: true },
  ];
  for (const field of fields) {
    assert.deepEqual(maskField(Object.freeze(field)), { ...field, value: MASK });
    assert.deepEqual(maskTree(field, []), { ...field, value: MASK });
  }
  assert.deepEqual(maskField(ordinary), ordinary);
  assert.deepEqual(maskField({ name: "login", type: "password" }), { name: "login", type: "password", value: MASK });
});

test("registered values are literal, case-sensitive, and ignore empty and one-character entries", () => {
  const literal = "fake.[a+b]$?";
  const input = `a 🍊 ${literal} fake.ab ${literal.toUpperCase()} FakeCanary fakeCanary ${literal}`;
  const registered = Object.freeze(["", "a", "🍊", "fake.", literal, "FakeCanary", literal]);
  const expected = `a 🍊 ${MASK} ${MASK}ab ${literal.toUpperCase()} ${MASK} fakeCanary ${MASK}`;
  assert.equal(maskText(input, registered), expected);
  assert.equal(maskText(expected, registered), expected);
});

test("Friday's text shield runs after registered values are masked", () => {
  const input = `page: ${canary}\npassword=fake-fixture-value`;
  const expected = `page: ${MASK}\npassword=${HIDDEN}`;
  assert.equal(maskText(input, known), expected);
  assert.equal(maskText(expected, known), expected);
});

test("deep and wide acyclic trees are masked without changing their input", () => {
  type Node = { name: string; children: Node[] };
  const depth = 10_000;
  let root: Node = { name: canary, children: [] };
  for (let i = 0; i < depth; i++) root = { name: "group", children: [root] };
  let deepest = maskTree(root, known);
  for (let i = 0; i < depth; i++) deepest = deepest.children[0];
  assert.equal(deepest.name === MASK, true);

  const wide = Array.from({ length: 512 }, (_, index) => ({ index, text: canary, other: [null, false] }));
  const masked = maskTree(wide, known);
  assert.ok(!JSON.stringify(masked).includes(canary));
  assert.equal(masked.length, wide.length);
  for (const [index, child] of masked.entries()) {
    assert.deepEqual(child, { index, text: MASK, other: [null, false] });
    assert.equal(wide[index].text === canary, true);
  }
});

test("images carry the secret field boxes for later pixel masking", () => {
  const passwordBox = Object.freeze({ x: 10, y: 20, width: 100, height: 24 });
  const brokerBox = Object.freeze({ x: 10, y: 50, width: 100, height: 24 });
  const fields = Object.freeze([
    { name: "login", type: "password", box: passwordBox },
    { name: "lookup", type: "text", value: canary, filledByBroker: true, box: brokerBox },
    { name: "verification", autocomplete: "one-time-code" },
    { name: "search", type: "text", box: { x: 10, y: 80, width: 100, height: 24 } },
  ]);
  const image = Object.freeze({ type: "image", mimeType: "image/png", data: "RklYVFVSRQ==" });
  const content = [image, { type: "text", text: canary }];
  const masked = maskAnswer({ output: "", fields, content }, known);
  assert.deepEqual(masked.content, [
    { ...image, needsRegionMask: true, fieldBoxes: [passwordBox, brokerBox] },
    { type: "text", text: MASK },
  ]);
  assert.ok(!JSON.stringify(masked).includes(canary));
  assert.deepEqual(maskAnswer(masked, known), masked);
  assert.deepEqual(maskAnswer({ output: "", content: [image] }, []).content, [
    { ...image, needsRegionMask: true, fieldBoxes: [] },
  ]);
});

test("there is no masking-off argument", () => {
  const options = { enabled: false, mask: false };
  const field = { name: "login", type: "password", value: "fake fixture" };
  const tree = { text: canary };
  const answer = { output: canary };
  assert.deepEqual([maskField.length, maskText.length, maskTree.length, maskAnswer.length], [1, 2, 2, 2]);
  assert.deepEqual(Reflect.apply(maskField, undefined, [field, options]), { ...field, value: MASK });
  assert.equal(Reflect.apply(maskText, undefined, [canary, known, options]), MASK);
  assert.deepEqual(Reflect.apply(maskTree, undefined, [tree, known, options]), { text: MASK });
  assert.deepEqual(Reflect.apply(maskAnswer, undefined, [answer, known, options]), { output: MASK });
});
