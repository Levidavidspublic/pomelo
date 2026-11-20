import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArtifactVersion } from "../src/pomelo/artifact-archive.js";
import { artifactHeaders } from "../src/pomelo/artifact-headers.js";
import { ARTIFACT_LIMITS } from "../src/pomelo/artifact-limit.js";
import { serveArtifact } from "../src/pomelo/artifact-serve.js";

const request = { threadId: "thread-1", artifactId: "report" };
const first: ArtifactVersion = {
  id: request.artifactId,
  threadId: request.threadId,
  kind: "html",
  version: 1,
  bodyRef: "examples/report-v1.html",
  createdAt: 100,
};
const second = { ...first, version: 2, bodyRef: "examples/report-v2.html", createdAt: 200 };
const third = { ...first, version: 3, bodyRef: "examples/report-v3.html", createdAt: 300 };
const html = Buffer.from("<p>Example artifact</p>");

function loaders(
  versions: readonly ArtifactVersion[] = [first],
  bodies: ReadonlyMap<string, Uint8Array> = new Map([[first.bodyRef, html]]),
) {
  const loadedIds: string[] = [];
  const readRefs: string[] = [];
  return {
    loadedIds,
    readRefs,
    async loadVersions(id: string) {
      loadedIds.push(id);
      const matching = versions.filter((record) => record.id === id);
      return matching.length ? matching : null;
    },
    async readBody(ref: string) {
      readRefs.push(ref);
      return bodies.get(ref) ?? null;
    },
  };
}

function assertFailure(result: Awaited<ReturnType<typeof serveArtifact>>, status: number, message: RegExp) {
  assert.equal(result.status, status);
  assert.ok("code" in result && "message" in result);
  assert.deepEqual(Object.keys(result).sort(), ["code", "message", "status"]);
  assert.equal(typeof result.code, "string");
  assert.notEqual(result.code, "");
  assert.match(result.message, message);
  assert.doesNotMatch(result.message, /[\\/]/);
  for (const { bodyRef } of [first, second, third]) {
    assert.ok(!result.message.includes(bodyRef));
  }
}

test("serves the requested HTML version with the exact artifact headers and original bytes", async () => {
  const deps = loaders([first, second]);
  const result = await serveArtifact({ ...request, version: 1 }, deps);

  assert.deepEqual(result, { status: 200, headers: artifactHeaders({ kind: "html" }), body: html });
  assert.ok("body" in result);
  assert.equal(result.body, html);
  assert.deepEqual(deps.loadedIds, [request.artifactId]);
  assert.deepEqual(deps.readRefs, [first.bodyRef]);
});

test("serves the newest live version by version number when none is requested", async () => {
  const latest = Buffer.from("<p>Updated artifact</p>");
  const deps = loaders(
    [{ ...third, archivedAt: 400 }, second, { ...first, createdAt: 500 }],
    new Map([[first.bodyRef, html], [second.bodyRef, latest]]),
  );

  assert.deepEqual(await serveArtifact(request, deps), {
    status: 200, headers: artifactHeaders({ kind: "html" }), body: latest,
  });
  assert.deepEqual(deps.readRefs, [second.bodyRef]);
});

test("reports an explicitly requested archived version as put away without reading a fallback", async () => {
  const deps = loaders([{ ...first, archivedAt: 0 }, second]);

  assertFailure(await serveArtifact({ ...request, version: 1 }, deps), 410, /put away/i);
  assert.deepEqual(deps.readRefs, []);
});

test("reports a missing requested version and an absent current version as not found", async () => {
  const live = loaders();
  const archived = loaders([{ ...first, archivedAt: 200 }]);

  assertFailure(await serveArtifact({ ...request, version: 9 }, live), 404, /not found/i);
  assertFailure(await serveArtifact(request, archived), 404, /not found/i);
  assert.deepEqual(live.readRefs, []);
  assert.deepEqual(archived.readRefs, []);
});

test("gives the same not-found reply for an unknown artifact and another thread's artifact", async () => {
  const deps = loaders([{ ...first, threadId: "thread-2", archivedAt: 100 }]);
  const missing = await serveArtifact({ ...request, artifactId: "missing", version: 1 }, deps);
  const foreign = await serveArtifact({ ...request, version: 1 }, deps);

  assertFailure(missing, 404, /not found/i);
  assert.deepEqual(foreign, missing);
  assert.deepEqual(deps.readRefs, []);
});

test("rejects a history with inconsistent ownership before reading a body", async () => {
  const deps = loaders([first, { ...second, threadId: "thread-2" }]);

  assertFailure(await serveArtifact(request, deps), 404, /not found/i);
  assert.deepEqual(deps.readRefs, []);
});

test("rejects invalid ids and versions before either loader runs", async () => {
  const deps = loaders();
  for (const field of ["artifactId", "threadId"] as const) {
    for (const id of ["has/slash", "has\\slash", "..", "has:colon", ""]) {
      assertFailure(await serveArtifact({ ...request, [field]: id }, deps), 400, /id/i);
    }
  }
  for (const version of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1e0"]) {
    assertFailure(await serveArtifact({ ...request, version: version as number }, deps), 400, /version/i);
  }
  assert.deepEqual(deps.loadedIds, []);
  assert.deepEqual(deps.readRefs, []);
});

test("reports a missing body as not found and rejects an invalid reference before reading", async () => {
  const missing = loaders([first], new Map());
  const invalid = loaders([{ ...first, bodyRef: "../artifacts/report.html" }]);

  assertFailure(await serveArtifact(request, missing), 404, /not found/i);
  assertFailure(await serveArtifact(request, invalid), 404, /not found/i);
  assert.deepEqual(missing.readRefs, [first.bodyRef]);
  assert.deepEqual(invalid.readRefs, []);
});

test("applies each artifact kind's byte ceiling", async () => {
  const { html: htmlBytes, code, data, image } = ARTIFACT_LIMITS.bodyBytesByKind;
  const limits = [
    ["html", "report.html", htmlBytes],
    ["mermaid", "report.mmd", code],
    ["chart", "report.json", data],
    ["image", "report.png", image],
  ] as const;

  for (const [kind, bodyRef, limit] of limits) {
    const record = { ...first, kind, bodyRef };
    const oversized = new Uint8Array(limit + 1);
    const body = oversized.subarray(1);
    const deps = loaders([record], new Map([[bodyRef, body]]));

    assert.deepEqual(await serveArtifact(request, deps), {
      status: 200, headers: artifactHeaders({ kind, fileName: bodyRef }), body,
    });
    assertFailure(await serveArtifact(request, {
      ...deps, readBody: () => oversized,
    }), 413, /too big/i);
  }
});

test("passes the download flag through to the artifact headers", async () => {
  const result = await serveArtifact({ ...request, download: true }, loaders());

  assert.deepEqual(result, {
    status: 200,
    headers: artifactHeaders({ kind: "html", fileName: "report-v1.html", download: true }),
    body: html,
  });
});

test("returns a fixed error when either loader fails", async () => {
  const deps = loaders();
  const loadFailure = await serveArtifact(request, {
    ...deps,
    loadVersions() {
      throw new Error(`Could not load artifacts/${first.bodyRef}`);
    },
  });
  assert.deepEqual(deps.readRefs, []);
  const readFailure = await serveArtifact(request, {
    ...deps,
    async readBody() {
      throw new Error(`Could not read artifacts/${first.bodyRef}`);
    },
  });

  assertFailure(loadFailure, 500, /artifact/i);
  assert.deepEqual(readFailure, loadFailure);
});
