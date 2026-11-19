import assert from "node:assert/strict";
import test from "node:test";
import { makeThreadLink, readThreadLink } from "../src/client/pomelo/thread-link.js";

// Friday session IDs are eight base64url characters and can start with a dash or underscore.
const threadId = "_aB3-dE7";
const threadLink = `#thread?threadId=${threadId}`;

test("a thread-only link keeps the Friday session id", () => {
  assert.equal(makeThreadLink({ threadId }), threadLink);
  assert.deepEqual(readThreadLink(threadLink), { ok: true, target: { threadId } });
});

test("a thread link can select any side panel", () => {
  for (const panel of ["browser", "artifact", "work"] as const) {
    const target = { threadId, panel };
    assert.equal(makeThreadLink(target), `${threadLink}&panel=${panel}`);
    assert.deepEqual(readThreadLink(`${threadLink}&panel=${panel}`), { ok: true, target });
  }
});

test("an artifact link can keep or omit the version", () => {
  const target = { threadId, panel: "artifact" as const, artifactId: "chart_1" };
  const link = `${threadLink}&panel=artifact&artifactId=chart_1`;
  assert.equal(makeThreadLink(target), link);
  assert.deepEqual(readThreadLink(link), { ok: true, target });
  assert.equal(makeThreadLink({ ...target, version: 1 }), `${link}&version=1`);
  assert.deepEqual(readThreadLink(`${link}&version=1`), { ok: true, target: { ...target, version: 1 } });
});

test("a browser job link keeps the job id", () => {
  const target = { threadId, panel: "browser" as const, jobId: "job-2" };
  const link = `${threadLink}&panel=browser&jobId=job-2`;
  assert.equal(makeThreadLink(target), link);
  assert.deepEqual(readThreadLink(link), { ok: true, target });
});

test("making and reading a link preserves all known fields", () => {
  const target = { threadId, panel: "artifact" as const, artifactId: "chart_1", version: 12, jobId: "job-2" };
  assert.deepEqual(readThreadLink(makeThreadLink(target)), { ok: true, target });
});

test("unknown panel names are refused", () => {
  assert.equal(readThreadLink(`${threadLink}&panel=settings`).ok, false);
});

test("versions must be positive integers with an artifact id", () => {
  for (const version of ["0", "-1", "1.5", "text", "", "1e2", "9007199254740993"]) {
    assert.equal(readThreadLink(`${threadLink}&artifactId=chart_1&version=${version}`).ok, false, version);
  }
  assert.equal(readThreadLink(`${threadLink}&version=1`).ok, false);
  assert.throws(() => makeThreadLink({ threadId, version: 1 }));
  for (const version of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => makeThreadLink({ threadId, artifactId: "chart_1", version }));
  }
});

test("missing, unsafe and oversized ids are refused", () => {
  assert.equal(readThreadLink("#thread?panel=work").ok, false);
  for (const id of ["", "a/b", "a b", "..", "a%2Fb", "a%20b", "%2e%2e", "a%0A", "a".repeat(129)]) {
    assert.equal(readThreadLink(`#thread?threadId=${id}`).ok, false, id);
    assert.equal(readThreadLink(`${threadLink}&artifactId=${id}`).ok, false, id);
    assert.equal(readThreadLink(`${threadLink}&jobId=${id}`).ok, false, id);
    assert.throws(() => makeThreadLink({ threadId: id }));
  }
  const target = { threadId: "a".repeat(128), artifactId: "b".repeat(128), jobId: "c".repeat(128) };
  assert.deepEqual(readThreadLink(makeThreadLink(target)), { ok: true, target });
});

test("URLs, script addresses and traversal paths are refused", () => {
  for (const address of [
    `http://example.invalid/${threadLink}`,
    `https://example.invalid/${threadLink}`,
    `javascript:${threadLink}`,
    `data:${threadLink}`,
    `//example.invalid/${threadLink}`,
    `/threads/../${threadLink}`,
    `#thread/../?threadId=${threadId}`,
  ]) {
    assert.equal(readThreadLink(address).ok, false, address);
  }
});

test("unknown keys are dropped and known fields cannot be repeated", () => {
  const target = { threadId };
  const withExtra = { ...target, extra: "ignored" };
  assert.equal(makeThreadLink(withExtra), threadLink);
  assert.deepEqual(readThreadLink(`${threadLink}&extra=ignored&extra=also-ignored`), { ok: true, target });
  assert.equal(readThreadLink(`${threadLink}&threadId=other`).ok, false);
  assert.equal(readThreadLink(`${threadLink}&panel=work&panel=browser`).ok, false);
});

test("oversized links are refused even if the extra field is unknown", () => {
  assert.equal(readThreadLink(`${threadLink}&extra=${"x".repeat(10_000)}`).ok, false);
});
