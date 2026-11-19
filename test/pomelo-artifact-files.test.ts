import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { checkBodyRef } from "../src/pomelo/artifact.js";
import { artifactDir, readArtifactBody, writeArtifactBody } from "../src/pomelo/artifact-files.js";

const artifact = { id: "artifact_1-a", version: 1, kind: "html" } as const;

function tempHome(t: TestContext): string {
  const home = mkdtempSync(path.join(tmpdir(), "pomelo-artifacts-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test("artifact bodies round-trip as bytes with the extension for their kind", async (t) => {
  const home = tempHome(t);
  assert.equal(artifactDir(home), path.join(home, "artifacts"));

  const bodies = [
    ["html", "html", "<p>Hello</p>"],
    ["mermaid", "mmd", "graph TD; A-->B"],
    ["chart", "json", '{"value":1}'],
    ["image", "bin", Buffer.from([0, 255, 128, 1])],
  ] as const;
  for (const [kind, extension, body] of bodies) {
    const bodyRef = await writeArtifactBody(home, { ...artifact, id: kind, kind }, body);
    assert.equal(bodyRef, `${kind}.v1.${extension}`);
    assert.ok(checkBodyRef(bodyRef));
    const expected = typeof body === "string" ? Buffer.from(body) : body;
    assert.deepEqual(await readArtifactBody(home, bodyRef), expected);
    assert.deepEqual(readFileSync(path.join(artifactDir(home), bodyRef)), expected);
  }
});

test("each artifact version keeps its own body file", async (t) => {
  const home = tempHome(t);
  const first = await writeArtifactBody(home, artifact, "first");
  const second = await writeArtifactBody(home, { ...artifact, version: 2 }, "second");

  assert.equal(second, `${artifact.id}.v2.html`);
  assert.notEqual(first, second);
  assert.deepEqual(readdirSync(artifactDir(home)).sort(), [first, second]);
  assert.deepEqual(await readArtifactBody(home, first), Buffer.from("first"));
  assert.deepEqual(await readArtifactBody(home, second), Buffer.from("second"));
});

test("artifact reads cannot access temporary bodies through directory links", async (t) => {
  const home = tempHome(t);
  const dir = artifactDir(home);
  mkdirSync(dir);
  writeFileSync(path.join(dir, "~pending.tmp"), "partial body");
  symlinkSync(dir, path.join(dir, "linked"), "junction");

  assert.equal(await readArtifactBody(home, "~pending.tmp"), null);
  assert.equal(await readArtifactBody(home, "linked/~pending.tmp"), null);
});

test("a failed rename cleans up the temporary artifact body", async (t) => {
  const home = tempHome(t);
  const bodyRef = `${artifact.id}.v1.html`;
  mkdirSync(path.join(artifactDir(home), bodyRef), { recursive: true });

  await assert.rejects(writeArtifactBody(home, artifact, "body"));
  assert.deepEqual(readdirSync(artifactDir(home)), [bodyRef]);
});

test("unsafe body references cannot read a file outside the artifacts folder", async (t) => {
  const home = tempHome(t);
  const outside = path.join(home, "outside.html");
  writeFileSync(outside, "outside");
  mkdirSync(artifactDir(home));

  for (const bodyRef of ["../outside.html", outside, "..\\outside.html", "../outside.html\0"]) {
    assert.equal(await readArtifactBody(home, bodyRef), null, JSON.stringify(bodyRef));
  }
  assert.deepEqual(readdirSync(artifactDir(home)), []);
  assert.equal(readFileSync(outside, "utf8"), "outside");
});

test("artifact reads reject directory links that lead outside the artifacts folder", async (t) => {
  const home = tempHome(t);
  const outside = path.join(home, "artifacts-other");
  mkdirSync(outside);
  writeFileSync(path.join(outside, "outside.html"), "outside");
  mkdirSync(artifactDir(home));
  symlinkSync(outside, path.join(artifactDir(home), "linked"), "junction");

  const bodyRef = "linked/outside.html";
  assert.ok(checkBodyRef(bodyRef));
  assert.equal(await readArtifactBody(home, bodyRef), null);
});

test("a linked artifacts folder is refused for both reads and writes", async (t) => {
  const home = tempHome(t);
  const outside = path.join(home, "other");
  mkdirSync(outside);
  const bodyRef = `${artifact.id}.v1.html`;
  writeFileSync(path.join(outside, bodyRef), "outside");
  symlinkSync(outside, artifactDir(home), "junction");

  assert.equal(await readArtifactBody(home, bodyRef), null);
  await assert.rejects(writeArtifactBody(home, artifact, "replacement"), /artifact.*directory/i);
  assert.deepEqual(readdirSync(outside), [bodyRef]);
  assert.equal(readFileSync(path.join(outside, bodyRef), "utf8"), "outside");
});

test("invalid artifact IDs and versions are refused before writing", async (t) => {
  const home = tempHome(t);
  for (const id of ["a/b", "a:b"]) {
    await assert.rejects(writeArtifactBody(home, { ...artifact, id }, "body"), /artifact id/i);
  }
  for (const version of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(writeArtifactBody(home, { ...artifact, version }, "body"), /artifact version/i);
  }
  assert.deepEqual(readdirSync(home), []);
});

test("artifact writes enforce a 5 MB byte limit", async (t) => {
  const home = tempHome(t);
  const limit = 5 * 1024 * 1024;
  await assert.rejects(writeArtifactBody(home, artifact, Buffer.alloc(limit + 1)), /5 MB/i);
  await assert.rejects(writeArtifactBody(home, artifact, "é".repeat(limit / 2 + 1)), /5 MB/i);
  assert.deepEqual(readdirSync(home), []);

  const bodyRef = await writeArtifactBody(home, artifact, Buffer.alloc(limit));
  assert.equal((await readArtifactBody(home, bodyRef))?.byteLength, limit);
});

test("reading missing artifact bodies returns null", async (t) => {
  const home = tempHome(t);
  assert.equal(await readArtifactBody(home, "missing.v1.html"), null);
  mkdirSync(artifactDir(home));
  assert.equal(await readArtifactBody(home, "missing.v1.html"), null);
});
