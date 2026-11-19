import assert from "node:assert/strict";
import { test } from "node:test";
import { ARTIFACT_KINDS, artifactKey, checkBodyRef, newArtifact, nextVersion, type Artifact } from "../src/pomelo/artifact.js";

const input = {
  id: "artifact_1-a",
  threadId: "thread-1",
  kind: "html",
  bodyRef: "report-v1.html",
  createdAt: 1_800_000_000_000,
} as const;

test("artifact keys use the Pomelo namespace and one id segment", () => {
  assert.equal(artifactKey(input.id), "pomelo:artifact:artifact_1-a");
  for (const id of ["", "a:b", "a/b", "a b", "a\\b", "a\n"]) {
    assert.throws(() => artifactKey(id), /artifact id/i, JSON.stringify(id));
  }
});

test("new artifacts start at version 1 with only the schema fields", () => {
  const withExtraField = { ...input, title: "Report" };
  assert.deepEqual(newArtifact(withExtraField), { ...input, version: 1 });
});

test("a new version preserves the artifact identity and earlier records", () => {
  const first = newArtifact(input);
  const second = nextVersion(first, "report-v2.html");
  const third = nextVersion(second, "report-v3.html", input.createdAt + 100);

  assert.deepEqual(first, { ...input, version: 1 });
  assert.deepEqual(second, { ...input, version: 2, bodyRef: "report-v2.html" });
  assert.deepEqual(third, { ...input, version: 3, bodyRef: "report-v3.html", createdAt: input.createdAt + 100 });
});

test("only the four schema kinds can be recorded", () => {
  assert.deepEqual(ARTIFACT_KINDS, ["html", "mermaid", "chart", "image"]);
  for (const kind of ARTIFACT_KINDS) {
    assert.equal(newArtifact({ ...input, kind }).kind, kind);
  }
  const kind = "widget" as Artifact["kind"];
  assert.throws(() => newArtifact({ ...input, kind }), /artifact kind/i);
  assert.throws(() => nextVersion({ ...input, kind, version: 1 }, "report-v2.html"), /artifact kind/i);
});

test("body references name files relative to the artifacts folder", () => {
  for (const bodyRef of ["report.html", "reports/chart-2.json", "report..draft.html"]) {
    assert.ok(checkBodyRef(bodyRef), bodyRef);
  }
  for (const bodyRef of [
    "", ".", "..", "/report.html", "reports/../report.html", "../report.html",
    "reports\\report.html", "C:\\report.html", "C:/report.html", "C:report.html",
    "~report.html", "~/report.html", "https://example.test/report.html", "file:report.html",
    "//example.test/report.html", "reports/", "report\0.html", "%2e%2e%2freport.html",
    "reports/.. /report.html", "reports/NUL.txt",
  ]) {
    assert.equal(checkBodyRef(bodyRef), false, JSON.stringify(bodyRef));
  }
  assert.throws(() => newArtifact({ ...input, bodyRef: "../report.html" }), /bodyRef/);
  assert.throws(() => nextVersion(newArtifact(input), "../report.html"), /bodyRef/);
});

test("the previous version must allow a positive, safe integer successor", () => {
  for (const version of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    const previous = { ...input, version };
    assert.throws(() => nextVersion(previous, "report-v2.html"), /artifact version/i);
  }
});
