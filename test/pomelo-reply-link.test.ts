import assert from "node:assert/strict";
import test from "node:test";
import { replyLink } from "../src/client/pomelo/reply-link.js";
import { makeThreadLink } from "../src/client/pomelo/thread-link.js";

const appOrigin = "https://pomelo.example";

test("cleans HTTPS addresses and gives external links safe opening attributes", () => {
  assert.deepEqual(replyLink({ href: "  HTTPS://Docs.Example/a b  ", text: "Read the docs", appOrigin }), {
    mode: "link",
    href: "https://docs.example/a%20b",
    host: "docs.example",
    text: "Read the docs",
    mismatch: false,
    target: "_blank",
    rel: "noopener noreferrer",
  });
});

test("allows HTTP and shows the destination port", () => {
  const result = replyLink({ href: "http://docs.example:8080/", text: "Docs", appOrigin });
  assert.equal(result.mode, "link");
  assert.equal(result.host, "docs.example:8080");
});

test("leaves unsupported schemes and addresses with credentials as plain text", () => {
  for (const href of [
    "javascript:alert(1)",
    "  JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,%3Cp%3EExample",
    "file:///c:/x",
    "vbscript:example",
    `blob:${appOrigin}/example`,
    "chrome://settings",
    "about:blank",
    "https://user:pass@host/",
    "https://user@host/",
    "https://:pass@host/",
  ]) {
    const result = replyLink({ href, text: "Example", appOrigin });
    assert.equal(result.mode, "text", href);
    assert.equal(result.text, "Example");
    assert.ok(result.reason, href);
  }
});

test("flags address-like labels for a different host and shows the actual host", () => {
  for (const text of ["bank.example", "https://bank.example/sign-in", "bank.example/sign-in"]) {
    const result = replyLink({ href: "https://docs.example/", text, appOrigin });
    assert.equal(result.mode, "link");
    assert.equal(result.mismatch, true, text);
    assert.equal(result.host, "docs.example");
  }
});

test("accepts prose and labels for the same normalized host", () => {
  for (const text of ["Read about bank.example", "DOCS.EXAMPLE", "https://docs.example:443/help"]) {
    const result = replyLink({ href: "https://docs.example/", text, appOrigin });
    assert.equal(result.mode, "link");
    assert.equal(result.mismatch, false, text);
  }
});

test("shows internationalized hosts in punycode", () => {
  for (const href of ["https://xn--bcher-kva.example/", "https://bücher.example/"]) {
    const result = replyLink({ href, text: "bücher.example", appOrigin });
    assert.equal(result.mode, "link");
    assert.equal(result.host, "xn--bcher-kva.example");
    assert.equal(result.mismatch, false);
  }
});

test("opens a valid same-origin thread address in the app", () => {
  const thread = { threadId: "example-1", panel: "work" as const };
  const fragment = makeThreadLink(thread);
  const absolute = `${appOrigin}/${fragment}`;
  for (const href of [absolute, fragment]) {
    assert.deepEqual(replyLink({ href, text: "Open thread", appOrigin }), {
      mode: "inApp",
      href: absolute,
      host: "pomelo.example",
      text: "Open thread",
      mismatch: false,
      thread,
    });
  }
});

test("only routes valid threads on the supplied origin in the app", () => {
  const fragment = makeThreadLink({ threadId: "example-1" });
  for (const href of [
    `https://other.example/${fragment}`,
    `https://pomelo.example:8080/${fragment}`,
    `http://pomelo.example/${fragment}`,
    `${appOrigin}/#thread?panel=work`,
    `${appOrigin}/help`,
  ]) {
    assert.equal(replyLink({ href, text: "Example", appOrigin }).mode, "link", href);
  }
  assert.equal(replyLink({ href: "#thread?panel=work", text: "Example", appOrigin }).mode, "text");
  assert.equal(replyLink({ href: fragment, text: "Example", appOrigin: "" }).mode, "text");
});

test("preserves Hebrew and strips hidden direction controls from labels", () => {
  const hebrew = "קִישּׁוּר לדוגמה";
  for (const text of [hebrew, `\u2067${hebrew}\u2069\u202E`]) {
    const result = replyLink({ href: "https://docs.example/", text, appOrigin });
    assert.equal(result.text, hebrew);
  }

  const result = replyLink({ href: "https://docs.example/", text: "bank.\u202Eexample", appOrigin });
  assert.equal(result.mode, "link");
  assert.equal(result.text, "bank.example");
  assert.equal(result.mismatch, true);
});

test("shows empty and unparsable addresses as text with a reason", () => {
  for (const href of ["", "   \t", "http://", "//docs.example/", "not an address"]) {
    const result = replyLink({ href, text: "Example", appOrigin });
    assert.equal(result.mode, "text", href);
    assert.ok(result.reason, href);
  }
});
