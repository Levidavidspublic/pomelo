import assert from "node:assert/strict";
import test from "node:test";
import { readOutput } from "../src/browser-driver.js";
import { MASK, maskAnswer, maskField, maskText, maskTree } from "../src/pomelo/mask.js";
import { HIDDEN } from "../src/secrets.js";

const canary = "FAKE POMELO+MASK@CANARY'END";
const known = Object.freeze([canary]);
const encodedCanary = encodeURIComponent(canary);
const uriCanary = encodeURI(canary);
const formQuery = new URLSearchParams({ lookup: canary }).toString();
const pageUrl = "https://example.invalid/?lookup=";
const browserUrl = new URL(`${pageUrl}${canary}`).href;
const browserCanary = browserUrl.slice(pageUrl.length);

test("the planted canary disappears from page reads, field values, the accessibility tree and the answer", () => {
  const page = Object.freeze({
    title: "Example page",
    url: `${browserUrl}&uri=${uriCanary}&component=${encodedCanary}`,
    text: `Page text contains ${canary}`,
    cut: false,
    items: Object.freeze([`[1] Item label ${canary}`]),
    fields: Object.freeze([Object.freeze({ name: "lookup", type: "text", value: canary, filledByBroker: true })]),
    accessibility: Object.freeze({ children: Object.freeze([{ role: "group", children: [{ role: "text", name: canary }] }]) }),
    pagesByUrl: Object.freeze({ [browserUrl]: { title: "Example page" }, [canary]: true }),
  });
  const answer = {
    output: readOutput({ ...page, items: [...page.items] }),
    content: [{ type: "text", text: `${page.text}\n${page.url}` }],
    isError: false,
    pagesByUrl: page.pagesByUrl,
  };

  const snapshot = maskTree(page, known);
  const maskedAnswer = maskAnswer(answer, known);
  for (const result of [maskField(page.fields[0]), maskText(page.text, known), snapshot, maskedAnswer]) {
    const json = JSON.stringify(result);
    for (const value of [canary, browserCanary, uriCanary, encodedCanary]) {
      assert.ok(!json.includes(value), "the serialized output must not contain any form of the canary");
    }
  }
  assert.deepEqual(snapshot, {
    ...page,
    url: `${pageUrl}${MASK}&uri=${MASK}&component=${MASK}`,
    text: `Page text contains ${MASK}`,
    items: [`[1] Item label ${MASK}`],
    fields: [{ ...page.fields[0], value: MASK }],
    accessibility: { children: [{ role: "group", children: [{ role: "text", name: MASK }] }] },
    pagesByUrl: { [`${pageUrl}${MASK}`]: { title: "Example page" }, [MASK]: true },
  });
  assert.deepEqual(maskedAnswer, {
    output: readOutput({ ...snapshot, items: [...snapshot.items] }),
    content: [{ type: "text", text: `${snapshot.text}\n${snapshot.url}` }],
    isError: false,
    pagesByUrl: snapshot.pagesByUrl,
  });
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

test("registered values are literal, case-sensitive, and ignore empty, one-character and whitespace-only entries", () => {
  const literal = "fake.[a+b]$?";
  const input = `a  🍊 \t\n${literal} fake.ab ${literal.toUpperCase()} FakeCanary fakeCanary ${literal}`;
  const registered = Object.freeze(["", "a", "🍊", "  ", "\t\n", "fake.", literal, "FakeCanary", literal]);
  const expected = `a  🍊 \t\n${MASK} ${MASK}ab ${literal.toUpperCase()} ${MASK} fakeCanary ${MASK}`;
  assert.equal(maskText(input, registered), expected);
  assert.equal(maskText(expected, registered), expected);
});

test("query masking covers browser, URI, component and form encoding without changing the value's case", () => {
  const lowerHex = encodedCanary.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase());
  const wrongCase = encodeURIComponent(canary.toLowerCase());
  const query = `${formQuery}&browser=${browserCanary}&uri=${uriCanary}&lowerHex=${lowerHex}&wrongCase=${wrongCase}`;
  const masked = maskText(query, known);
  assert.ok(masked === `lookup=${MASK}&browser=${MASK}&uri=${MASK}&lowerHex=${MASK}&wrongCase=${wrongCase}`);
  assert.equal(maskText(masked, known), masked);
});

test("overlapping registered values are fully masked regardless of registration order", () => {
  for (const registered of [["abc", "bcdef", "efgh"], ["efgh", "bcdef", "abc"]]) {
    const masked = maskText("prefix abcdefgh abcabc suffix", registered);
    assert.ok(masked === `prefix ${MASK} ${MASK}${MASK} suffix`);
    assert.equal(maskText(masked, registered), masked);
  }
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
  const registeredBox = Object.freeze({ x: 10, y: 110, width: 100, height: 24 });
  const fields = Object.freeze([
    { name: "login", type: "password", box: passwordBox },
    { name: "lookup", type: "text", value: canary, filledByBroker: true, box: brokerBox },
    { name: "verification", autocomplete: "one-time-code" },
    { name: "search", type: "text", box: { x: 10, y: 80, width: 100, height: 24 } },
    { name: "registered", type: "text", value: `prefix ${canary}`, box: registeredBox },
  ]);
  const image = Object.freeze({ type: "image", mimeType: "image/png", data: "RklYVFVSRQ==" });
  const content = [image, { type: "text", text: canary }];
  const masked = maskAnswer({ output: "", fields, content }, known);
  assert.deepEqual(masked.content, [
    { ...image, needsRegionMask: true, fieldBoxes: [passwordBox, brokerBox, registeredBox] },
    { type: "text", text: MASK },
  ]);
  assert.ok(!JSON.stringify(masked).includes(canary));
  assert.deepEqual(maskAnswer(masked, known), masked);
  assert.deepEqual(maskAnswer({ output: "", content: [image] }, []).content, [
    { ...image, needsRegionMask: true, fieldBoxes: [] },
  ]);
});

test("image annotations mask structured data and only return boxes with finite coordinates", () => {
  const image = { type: "image", data: { [canary]: [canary] } };
  const fields = [
    { type: "password", box: { x: 10, y: 20, width: canary as unknown as number, height: 24 } },
    { type: "password", box: { x: Infinity, y: 20, width: 100, height: 24 } },
  ];
  const masked = maskAnswer({ output: "", fields, content: [image] }, known);
  assert.ok(!JSON.stringify(masked).includes(canary));
  assert.deepEqual(masked.content, [
    { type: "image", data: { [MASK]: [MASK] }, needsRegionMask: true, fieldBoxes: [] },
  ]);
  assert.deepEqual(maskAnswer(masked, known), masked);
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
