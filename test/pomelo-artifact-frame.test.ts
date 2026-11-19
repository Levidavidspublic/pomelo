import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { artifactFrameProps } from "../src/client/pomelo/artifact-frame.js";

const POLICY = /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="([^"]+)">/;
const ARTIFACT = /<script type="application\/json" id="artifact">([^<]*)<\/script>/;

test("the frame has an opaque origin, no navigation privileges, and no URL source", () => {
  const props = artifactFrameProps("<p>Hello</p>", "Example artifact");
  assert.deepEqual(props.sandbox.split(/\s+/), ["allow-scripts"]);
  assert.equal(props.referrerPolicy, "no-referrer");
  assert.equal(props.title, "Example artifact");
  assert.ok(!Object.hasOwn(props, "src"));
});

test("the first policy blocks external resources and only authorizes the fixed renderer script", () => {
  const { srcDoc } = artifactFrameProps("<p>Hello</p>", "Example");
  const policy = POLICY.exec(srcDoc);
  assert.ok(policy);
  const renderer = /<script>([\s\S]+?)<\/script>/.exec(srcDoc);
  assert.ok(renderer);
  const hash = createHash("sha256").update(renderer[1]!).digest("base64");
  assert.deepEqual(policy[1]!.split("; "), [
    "default-src 'none'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `script-src 'sha256-${hash}'`,
    "style-src 'unsafe-inline'",
    "img-src data:",
  ]);
});

test("the artifact is carried as inert data after the first policy, including its own CSP and base", () => {
  const html = `<meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://example.invalid/"><p>Hello</p></ScRiPt><p>Still in the artifact</p>`;
  const { srcDoc } = artifactFrameProps(html, "Example");
  const policy = POLICY.exec(srcDoc);
  const artifact = ARTIFACT.exec(srcDoc);
  assert.ok(policy && artifact);
  assert.ok(artifact.index >= policy[0].length);
  assert.equal(JSON.parse(artifact[1]!), html);
  assert.equal(srcDoc.match(/<meta http-equiv="Content-Security-Policy"/gi)?.length, 1);
  assert.doesNotMatch(srcDoc, /<base\b/i);
});

test("empty input produces a complete document with an accessible fallback title", () => {
  const { srcDoc, title } = artifactFrameProps("", " ");
  assert.match(srcDoc, POLICY);
  assert.match(srcDoc, /<\/head><body>/);
  assert.match(srcDoc, /<\/body><\/html>$/);
  const artifact = ARTIFACT.exec(srcDoc);
  assert.ok(artifact);
  assert.equal(JSON.parse(artifact[1]!), "");
  assert.equal(title, "HTML artifact");
});
