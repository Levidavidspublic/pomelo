import assert from "node:assert/strict";
import test from "node:test";
import { artifactFrameProps } from "../src/client/pomelo/artifact-frame.js";

const POLICY = /^<!doctype html><meta http-equiv="Content-Security-Policy" content="([^"]+)">/;
const REFERRER = '<meta name="referrer" content="no-referrer">';

test("the frame has an opaque origin, a no-referrer policy, and no URL source", () => {
  const props = artifactFrameProps("<p>Hello</p>", "Example artifact");
  assert.deepEqual(props.sandbox.split(/\s+/), ["allow-scripts"]);
  assert.equal(props.referrerPolicy, "no-referrer");
  assert.equal(props.title, "Example artifact");
  assert.ok(!Object.hasOwn(props, "src"));
});

test("the first policy blocks external resources and connections while allowing inline scripts", () => {
  const { srcDoc } = artifactFrameProps("<p>Hello</p>", "Example");
  const policy = POLICY.exec(srcDoc);
  assert.ok(policy);
  assert.deepEqual(policy[1]!.split("; "), [
    "default-src 'none'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data:",
  ]);
});

test("a complete artifact keeps its scripts and markup after the policies", () => {
  const html = `<html lang="en">
    <head><title>Chart</title><style>canvas { width: 100% }</style></head>
    <body>
      <svg></svg>
      <canvas id="chart"></canvas>
      <button>Redraw</button>
      <a href="#chart">Go to chart</a>
      <script>document.querySelector("canvas").getContext("2d").fillRect(0, 0, 10, 10)</script>
    </body>
  </html>`;
  const { srcDoc } = artifactFrameProps(`<!DOCTYPE html>${html}`, "Chart");
  const policy = POLICY.exec(srcDoc);
  assert.ok(policy);
  assert.equal(srcDoc.slice(policy[0].length), REFERRER + html);
});

test("the first policy precedes an artifact's own CSP and blocks its base URL", () => {
  const html = `<meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://example.invalid/"><p>Hello</p>`;
  const { srcDoc } = artifactFrameProps(html, "Example");
  const policy = POLICY.exec(srcDoc);
  assert.ok(policy);
  assert.ok(policy[1]!.split("; ").includes("base-uri 'none'"));
  assert.equal(srcDoc.slice(policy[0].length), REFERRER + html);
});

test("empty input produces a complete document with an accessible fallback title", () => {
  const { srcDoc, title } = artifactFrameProps("", " ");
  const policy = POLICY.exec(srcDoc);
  assert.ok(policy);
  assert.equal(srcDoc.slice(policy[0].length), REFERRER + "<body></body>");
  assert.equal(title, "HTML artifact");
});
