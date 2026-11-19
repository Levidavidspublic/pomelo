import assert from "node:assert/strict";
import test from "node:test";
import { artifactToolbar } from "../src/client/pomelo/artifact-toolbar.js";

const kinds = [
  { kind: "html", extension: "html", mime: "text/html", copyLabel: "Copy source", sandbox: "allow-scripts" },
  { kind: "mermaid", extension: "mmd", mime: "text/plain", copyLabel: "Copy source", sandbox: null },
  { kind: "chart", extension: "json", mime: "application/json", copyLabel: "Copy source", sandbox: null },
  { kind: "image", extension: "png", mime: "image/png", copyLabel: "Copy image", sandbox: null },
] as const;

for (const { kind, extension, mime, copyLabel, sandbox } of kinds) {
  test(`${kind} gets the right copy, download and window settings`, () => {
    const toolbar = artifactToolbar({ kind, title: "Sample artifact", version: 2, latest: 3 });

    assert.deepEqual(toolbar.copy, { enabled: true, label: copyLabel });
    assert.deepEqual(toolbar.download, { fileName: `Sample-artifact-v2.${extension}`, mime });
    assert.equal(toolbar.openInWindow.enabled, true);
    assert.equal(toolbar.openInWindow.sandbox, sandbox);
    const features = toolbar.openInWindow.features.split(",");
    assert.ok(features.includes("noopener"));
    assert.ok(features.includes("noreferrer"));
  });
}

test("an HTML artifact keeps its sandbox when opened in a window", () => {
  const { sandbox } = artifactToolbar({ kind: "html", title: "Sample", version: 1, latest: 1 }).openInWindow;

  assert.ok(sandbox);
  assert.doesNotMatch(sandbox, /allow-same-origin|allow-top-navigation|allow-popups/);
});

test("download titles keep Unicode letters and digits and collapse other runs", () => {
  const input = { kind: "chart" as const, version: 1, latest: 1 };

  assert.equal(artifactToolbar({ ...input, title: "  דוח ٢٠٢٦ / סיכום! " }).download.fileName, "דוח-٢٠٢٦-סיכום-v1.json");
  assert.equal(artifactToolbar({ ...input, title: ".. / \\ 🪐 !" }).download.fileName, "artifact-v1.json");

  const { fileName } = artifactToolbar({ ...input, title: "../../etc\\passwd" }).download;
  assert.equal(fileName, "etc-passwd-v1.json");
  assert.doesNotMatch(fileName, /[/\\]|\.\.|^\./);
});

test("download titles use at most 60 characters before the version and extension", () => {
  const stem = "a".repeat(59) + "𐐀";
  const { fileName } = artifactToolbar({ kind: "image", title: ` !${stem}b`, version: 2, latest: 2 }).download;

  assert.equal(fileName, `${stem}-v2.png`);
});

test("the picker shows versions newest first and marks the current and latest versions", () => {
  const { versions } = artifactToolbar({ kind: "mermaid", title: "Sample", version: 2, latest: 3 });

  assert.deepEqual(versions, [
    { version: 3, label: "v3", current: false, latest: true },
    { version: 2, label: "v2", current: true, latest: false },
    { version: 1, label: "v1", current: false, latest: false },
  ]);
});

test("an invalid current version selects the latest version and uses it in the download name", () => {
  for (const version of [0, -1, 1.5, NaN, Infinity, 4]) {
    const { versions, download } = artifactToolbar({ kind: "html", title: "Sample", version, latest: 3 });

    assert.deepEqual(versions.filter((entry) => entry.current), [
      { version: 3, label: "v3", current: true, latest: true },
    ]);
    assert.equal(download.fileName, "Sample-v3.html");
  }
});

test("an invalid latest version falls back to version one", () => {
  for (const latest of [0, -1, 2.5, NaN, Infinity, 2 ** 32, Number.MAX_VALUE]) {
    const { versions, download } = artifactToolbar({ kind: "html", title: "Sample", version: 2, latest });

    assert.deepEqual(versions, [{ version: 1, label: "v1", current: true, latest: true }]);
    assert.equal(download.fileName, "Sample-v1.html");
  }
});
