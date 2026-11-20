import assert from "node:assert/strict";
import test from "node:test";
import { checkPageScript } from "../src/pomelo/browser/script-rule.js";

for (const [reason, scripts] of Object.entries({
  cookies: [
    "document.cookie", "document?.['cookie']", "cookieStore.get('example')",
    "(document).cookie", "const d = document; d.cookie", "const { cookie } = document",
  ],
  storage: ["localStorage.length", "window.sessionStorage.length", "indexedDB.databases()"],
  "field-value": [
    "field.value", 'field["value"]', "new FormData(form)", "const { value } = field",
    "const { id, value: text } = field", 'const { "value": text } = field',
    "const { value = '' } = field",
  ],
  network: [
    "fetch(target)", "new XMLHttpRequest()", "navigator.sendBeacon(target)",
    "new WebSocket(target)", "new EventSource(target)",
    "image.src = target", 'link["href"] += suffix', "location = target",
    "window.location.href = target", "image.setAttribute('src', target)", "location.replace(target)",
  ],
  "dynamic-code": ["eval(source)", "new Function(source)", 'setTimeout("work()", 0)'],
  clipboard: ["navigator.clipboard.readText()", "window.clipboardData.getData('text')"],
})) {
  test(`refuses ${reason} with its own reason code`, () => {
    for (const script of scripts) {
      assert.deepEqual(checkPageScript(script), { decision: "refuse", reasons: [reason] });
    }
  });
}

test("holds computed keys on browser globals", () => {
  for (const script of [
    "document['coo' + 'kie']", "window[key]", "globalThis?.[key]", "navigator[method()]",
    "document[`\\u0063ookie`]", "window?.[`\\x74itle`]", "document[`ti${suffix}`]",
  ]) {
    assert.deepEqual(checkPageScript(script), { decision: "hold", reasons: ["computed-key"] });
  }
});

test("holds identifier escapes", () => {
  for (const script of [String.raw`document.\u0063ookie`, String.raw`document.\x63ookie`]) {
    assert.deepEqual(checkPageScript(script), { decision: "hold", reasons: ["identifier-escape"] });
  }
});

test("holds ambiguous lexical syntax for review", () => {
  for (const script of ["/title/.test(document.title)", '"unfinished']) {
    assert.deepEqual(checkPageScript(script), { decision: "hold", reasons: ["unclear-syntax"] });
  }
});

test("holds scripts above 2000 characters", () => {
  const script = "document.title".padEnd(2000);
  assert.deepEqual(checkPageScript(script), { decision: "allow", reasons: [] });
  assert.deepEqual(checkPageScript(script + " "), { decision: "hold", reasons: ["too-long"] });
});

test("holds non-text input and refuses empty text", () => {
  for (const script of [123, {}, null, "\0"]) {
    assert.deepEqual(checkPageScript(script), { decision: "hold", reasons: ["not-text"] });
  }
  for (const script of ["", " \t\n"]) {
    assert.deepEqual(checkPageScript(script), { decision: "refuse", reasons: ["empty"] });
  }
});

test("allows ordinary page reads, scrolling, and function timers", () => {
  for (const script of [
    "document.title", "el.getBoundingClientRect()", "el.innerText", 'document[ "title" ]',
    "document[`title`]", "`\\u05e9`", "const value = document.title; value",
    "window.scrollTo(0, 500)", "el.href === target", "setTimeout(() => window.scrollTo(0, 500), 0)",
    String.raw`"\u05e9"`,
  ]) {
    assert.deepEqual(checkPageScript(script), { decision: "allow", reasons: [] });
  }
});

test("strips comments without hiding code or string literals", () => {
  for (const script of [
    "// document.cookie",
    "// document.cookie\ndocument.title",
    "document.title /* fetch(target) and navigator.clipboard */",
    "`${document.title /* document.cookie */}`",
  ]) {
    assert.deepEqual(checkPageScript(script), { decision: "allow", reasons: [] });
  }
  for (const script of [
    "'document.cookie'", '"// document.cookie"', "'/* document.cookie */'",
    "document /* comment */ . /* comment */ cookie", "`${document.cookie}`",
  ]) {
    assert.deepEqual(checkPageScript(script), { decision: "refuse", reasons: ["cookies"] });
  }
});

test("returns every reason once, in rule order, with refusal taking precedence", () => {
  for (const script of [
    "fetch(target); document.cookie; cookieStore.get('example'); fetch(target)",
    "document.cookie; cookieStore.get('example'); fetch(target)",
  ]) {
    assert.deepEqual(checkPageScript(script), { decision: "refuse", reasons: ["cookies", "network"] });
  }
  assert.deepEqual(checkPageScript("window[key]; document.cookie"), {
    decision: "refuse",
    reasons: ["cookies", "computed-key"],
  });
});

test("returns reason codes without echoing a synthetic canary", () => {
  const canary = ["synthetic", "page-script", "canary"].join("-");
  const result = checkPageScript(`document.cookie = ${JSON.stringify(canary)}`);
  assert.deepEqual(result, { decision: "refuse", reasons: ["cookies"] });
  assert.equal(JSON.stringify(result).includes(canary), false);
});
