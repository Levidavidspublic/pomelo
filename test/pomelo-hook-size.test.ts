import assert from "node:assert/strict";
import test from "node:test";
import { checkHookSize } from "../src/pomelo/hook-size.js";

test("allows the seven-line mesh hook and a change at the limit", () => {
  const numstat = "7\t0\tsrc/agent-mesh.ts\n20\t100\tsrc/app.ts";

  assert.deepEqual(checkHookSize(numstat), { ok: true, tooBig: [] });
});

test("reports oversized Friday changes sorted by path", () => {
  const numstat = "24\t0\tsrc/room.ts\n21\t20\tsrc/app.ts";

  assert.deepEqual(checkHookSize(numstat), {
    ok: false,
    tooBig: [
      { path: "src/app.ts", added: 21, limit: 20 },
      { path: "src/room.ts", added: 24, limit: 20 },
    ],
  });
});

test("exempts Pomelo paths and the lockfile", () => {
  const numstat = [
    "500\t0\tsrc/pomelo/x.ts",
    "500\t0\tsrc\\client\\pomelo\\panel.tsx",
    "500\t0\ttest/pomelo-x.test.ts",
    "500\t0\tdocs/harness/02-TRD.md",
    "500\t0\tPATCHES.md",
    "500\t0\tTHIRD-PARTY-NOTICES.md",
    "500\t0\tpackage-lock.json",
    "-\t-\tsrc/pomelo/icon.png",
  ].join("\n");

  assert.deepEqual(checkHookSize(numstat), { ok: true, tooBig: [] });
});

test("reports a Friday binary with a null addition count", () => {
  assert.deepEqual(checkHookSize("-\t-\tpublic/logo.png"), {
    ok: false,
    tooBig: [{ path: "public/logo.png", added: null, limit: 20 }],
  });
});

test("uses the destination path for both rename forms", () => {
  const numstat = [
    "30\t0\tsrc/pomelo/old.ts => src/app.ts",
    "25\t0\tpublic/{old => new}/logo.svg",
    "27\t0\tsrc/{old => }/worker.ts",
    "500\t0\tsrc/{legacy => pomelo}/x.ts",
    "500\t0\tsrc/{ => pomelo}/y.ts",
    "500\t0\told-lock.json => package-lock.json",
  ].join("\n");

  assert.deepEqual(checkHookSize(numstat), {
    ok: false,
    tooBig: [
      { path: "public/new/logo.svg", added: 25, limit: 20 },
      { path: "src/app.ts", added: 30, limit: 20 },
      { path: "src/worker.ts", added: 27, limit: 20 },
    ],
  });
});

test("decodes Git-quoted paths before checking ownership and reporting", () => {
  const numstat = [
    '25\t0\tsrc/pomelo/old.ts => "src/caf\\303\\251.ts"',
    '500\t0\t"src/pomelo/caf\\303\\251.ts"',
    '500\t0\t"src/caf\\303\\251.ts" => "src/pomelo/caf\\303\\251.ts"',
  ].join("\n");

  assert.deepEqual(checkHookSize(numstat), {
    ok: false,
    tooBig: [{ path: "src/café.ts", added: 25, limit: 20 }],
  });
});

test("ignores blank and malformed rows", () => {
  const numstat = [
    "",
    "   ",
    "21\tsrc/app.ts",
    "21\t0\t",
    "21\t0\tsrc/app.ts\textra",
    "21abc\t0\tsrc/app.ts",
    "21\t-1\tsrc/app.ts",
    "2.1e1\t0\tsrc/app.ts",
    "-\t0\tsrc/app.ts",
    "21\t-\tsrc/app.ts",
    "22\t0\tpublic/file name.js",
    "",
  ].join("\r\n");

  assert.deepEqual(checkHookSize(numstat), {
    ok: false,
    tooBig: [{ path: "public/file name.js", added: 22, limit: 20 }],
  });
});

test("uses a custom positive whole-number limit", () => {
  const numstat = "1\t0\tsrc/agent-mesh.ts\n2\t0\tsrc/app.ts";

  assert.deepEqual(checkHookSize(numstat, 1), {
    ok: false,
    tooBig: [{ path: "src/app.ts", added: 2, limit: 1 }],
  });
});

test("throws a TypeError for invalid limits", () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => checkHookSize("", limit), TypeError);
  }
});
