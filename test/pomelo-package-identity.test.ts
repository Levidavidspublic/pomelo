import assert from "node:assert/strict";
import test from "node:test";
import { checkPackageIdentity } from "../src/pomelo/package-identity.js";

test("accepts identical manifests", () => {
  const manifest = '{"name":"friday-work","version":"0.3.4","license":"MIT"}';
  assert.deepEqual(checkPackageIdentity(manifest, manifest), { ok: true, changes: [] });
});

test("reports a version bump", () => {
  assert.deepEqual(checkPackageIdentity('{"version":"0.3.4"}', '{"version":"0.3.5"}'), {
    ok: false,
    changes: [{ field: "version", kind: "changed", reason: 'The package.json field "version" was changed.' }],
  });
});

test("reports a package rename", () => {
  assert.deepEqual(checkPackageIdentity('{"name":"friday-work"}', '{"name":"example"}'), {
    ok: false,
    changes: [{ field: "name", kind: "changed", reason: 'The package.json field "name" was changed.' }],
  });
});

test("explains why Friday's MIT licence must stay when changed or removed", () => {
  for (const [head, kind] of [['{"license":"Apache-2.0"}', "changed"], ['{}', "removed"]] as const) {
    assert.deepEqual(checkPackageIdentity('{"license":"MIT"}', head), {
      ok: false,
      changes: [{ field: "license", kind, reason: "Friday's MIT licence must stay." }],
    });
  }
});

test("ignores formatting and key order in bin, repository and nested objects", () => {
  assert.deepEqual(checkPackageIdentity(
    '{"bin":{"friday":"bin/friday.mjs","helper":"bin/helper.mjs"},"repository":{"type":"git","url":"https://example.test/repo"},"build":{"linux":{"target":["zip"],"category":"Utility"}}}',
    '{ "build": {"linux":{"category":"Utility","target":["zip"]}}, "repository": {"url":"https://example.test/repo","type":"git"}, "bin": {"helper":"bin/helper.mjs","friday":"bin/friday.mjs"} }',
  ), { ok: true, changes: [] });
});

test("reports a new bin entry as a change to bin", () => {
  assert.deepEqual(checkPackageIdentity(
    '{"bin":{"friday":"bin/friday.mjs"}}',
    '{"bin":{"friday":"bin/friday.mjs","helper":"bin/helper.mjs"}}',
  ), {
    ok: false,
    changes: [{ field: "bin", kind: "changed", reason: 'The package.json field "bin" was changed.' }],
  });
});

test("reports a reordered files array", () => {
  assert.deepEqual(checkPackageIdentity('{"files":["bin","src"]}', '{"files":["src","bin"]}'), {
    ok: false,
    changes: [{ field: "files", kind: "changed", reason: 'The package.json field "files" was changed.' }],
  });
});

test("explains the publication risk when publishConfig is added", () => {
  assert.deepEqual(checkPackageIdentity('{}', '{"publishConfig":{"access":"public"}}'), {
    ok: false,
    changes: [{ field: "publishConfig", kind: "added", reason: "The fork must not be publishable to npm." }],
  });
});

test("explains the publication risk when private is removed or set to false", () => {
  for (const [head, kind] of [['{}', "removed"], ['{"private":false}', "changed"]] as const) {
    assert.deepEqual(checkPackageIdentity('{"private":true}', head), {
      ok: false,
      changes: [{ field: "private", kind, reason: "The fork must not be publishable to npm." }],
    });
  }
});

test("reports each changed metadata field even when several change together", () => {
  const result = checkPackageIdentity(
    '{"repository":{"type":"git","url":"https://example.test/old"},"author":"Example","build":{"linux":{"target":["zip"]}}}',
    '{"repository":{"type":"git","url":"https://example.test/new"},"homepage":"https://example.test","build":{"linux":{"target":["deb"]}}}',
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.changes.map(({ field, kind }) => ({ field, kind })), [
    { field: "repository", kind: "changed" },
    { field: "homepage", kind: "added" },
    { field: "author", kind: "removed" },
    { field: "build", kind: "changed" },
  ]);
});

test("ignores an edit to scripts alone", () => {
  assert.deepEqual(checkPackageIdentity(
    '{"scripts":{"test":"node scripts/test.mjs"}}',
    '{"scripts":{"test":"node --test"}}',
  ), { ok: true, changes: [] });
});

test("ignores engines, type, main and dependency fields", () => {
  assert.deepEqual(checkPackageIdentity(
    '{"engines":{"node":">=22"},"type":"module","main":"dist/main.js","dependencies":{"example":"1.0.0"}}',
    '{"engines":{"node":">=24"},"type":"commonjs","main":"index.js","devDependencies":{"example":"2.0.0"},"optionalDependencies":{"example":"2.0.0"},"peerDependencies":{"example":"2.0.0"}}',
  ), { ok: true, changes: [] });
});

test("reports one unreadable finding for broken JSON in head", () => {
  assert.deepEqual(checkPackageIdentity('{"name":"friday-work"}', '{"name":'), {
    ok: false,
    changes: [{ field: "package.json (head)", kind: "unreadable", reason: "Expected a JSON object." }],
  });
});

test("reports one unreadable finding for a JSON array in base", () => {
  assert.deepEqual(checkPackageIdentity('[]', '{"name":"friday-work"}'), {
    ok: false,
    changes: [{ field: "package.json (base)", kind: "unreadable", reason: "Expected a JSON object." }],
  });
});

test("reports one unreadable finding when both inputs are invalid, even when identical", () => {
  assert.deepEqual(checkPackageIdentity('null', 'null'), {
    ok: false,
    changes: [{ field: "package.json (base and head)", kind: "unreadable", reason: "Expected a JSON object." }],
  });
});
