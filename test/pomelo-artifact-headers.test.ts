import assert from "node:assert/strict";
import { test } from "node:test";
import { ARTIFACT_KINDS } from "../src/pomelo/artifact.js";
import { artifactHeaders } from "../src/pomelo/artifact-headers.js";

test("HTML can run inline scripts and styles in an opaque sandbox", () => {
  const headers = artifactHeaders({ kind: "html", fileName: "report.html" });
  assert.equal(headers["Content-Type"], "text/html; charset=utf-8");
  assert.deepEqual(headers["Content-Security-Policy"].split("; "), [
    "sandbox allow-scripts",
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ]);
  assert.equal(headers["Content-Disposition"], undefined);
  assert.equal(artifactHeaders({ kind: "html" })["Content-Type"], "text/html; charset=utf-8");
});

test("diagram and chart bodies use their fixed source types", () => {
  for (const kind of ["diagram", "mermaid"]) {
    assert.equal(artifactHeaders({ kind, fileName: "flow.mmd" })["Content-Type"], "text/plain; charset=utf-8");
  }
  assert.equal(artifactHeaders({ kind: "chart", fileName: "plot.json" })["Content-Type"], "application/json");
});

test("supported raster images keep their media type under a deny-all policy", () => {
  for (const [extension, type] of Object.entries({ png: "png", JPG: "jpeg", jpeg: "jpeg", webp: "webp", gif: "gif" })) {
    const headers = artifactHeaders({ kind: "image", fileName: `picture.${extension}` });
    assert.equal(headers["Content-Type"], `image/${type}`, extension);
    assert.equal(headers["Content-Security-Policy"], "default-src 'none'");
    assert.equal(headers["Content-Disposition"], undefined);
  }
});

test("unsupported or mismatched input is offered as an octet-stream attachment", () => {
  for (const input of [
    { kind: "image", fileName: "drawing.SVG" },
    { kind: "image", fileName: "body.bin" },
    { kind: "image", fileName: "picture" },
    { kind: "image", fileName: "" },
    { kind: "image" },
    { kind: "other", fileName: "report.html" },
    { kind: "constructor", fileName: "report.html" },
    { kind: "html", fileName: "picture.png" },
    { kind: "html", fileName: "report.html\n" },
    { kind: "chart", fileName: "chart.html" },
    { kind: "image", fileName: "picture.png.html" },
    { kind: "html", fileName: null },
    { kind: "html", download: "false" },
    null,
  ]) {
    const headers = artifactHeaders(input as Parameters<typeof artifactHeaders>[0]);
    assert.equal(headers["Content-Type"], "application/octet-stream", JSON.stringify(input));
    assert.match(headers["Content-Disposition"], /^attachment; /);
    assert.equal(headers["Content-Security-Policy"], "default-src 'none'");
  }
});

test("a requested download keeps its type and safely encodes its filename", () => {
  const chart = artifactHeaders({ kind: "chart", fileName: "chart.json", download: true });
  assert.equal(chart["Content-Type"], "application/json");
  assert.match(chart["Content-Disposition"], /^attachment; /);

  const headers = artifactHeaders({ kind: "chart", fileName: "../folder\\דו״ח 'next'(1)\"\r\n.json", download: true });
  const disposition = /^attachment; filename="([A-Za-z0-9._ -]+)"; filename\*=UTF-8''([A-Za-z0-9._%!-]+)$/.exec(headers["Content-Disposition"]);
  assert.ok(disposition);
  assert.ok(disposition[1].endsWith(".json"));
  assert.equal(decodeURIComponent(disposition[2]), "דו״ח 'next'(1)\".json");

  for (const fileName of ["../..", "folder/", "NUL.txt", "\ud800.txt"]) {
    const header = artifactHeaders({ kind: "other", fileName })["Content-Disposition"];
    assert.match(header, /^attachment; filename="[A-Za-z0-9._ -]+"; filename\*=UTF-8''.+$/);
    assert.doesNotMatch(header, /filename="(?:\.{1,2}|NUL\.txt)"/);
  }
});

test("every artifact kind returns cookie-free headers without carriage returns or line feeds", () => {
  for (const kind of [...ARTIFACT_KINDS, "diagram", "unknown"]) {
    for (const fileName of [undefined, "a.html", "a.mmd", "a.json", "a.png", "bad\r\nname.svg"]) {
      for (const download of [false, true]) {
        const headers = artifactHeaders({ kind, fileName, download });
        assert.equal(headers["X-Content-Type-Options"], "nosniff");
        assert.equal(headers["Cache-Control"], "no-store");
        assert.equal(headers["Referrer-Policy"], "no-referrer");
        assert.ok(Object.keys(headers).every((key) => key.toLowerCase() !== "set-cookie"));
        for (const value of Object.values(headers)) assert.doesNotMatch(value, /[\r\n]/);
      }
    }
  }
});
