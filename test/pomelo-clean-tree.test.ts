import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { junkPaths } from "../src/pomelo/tracked-junk.js";

test("finds worker scratch paths, caches and local state among ordinary files", () => {
  const junk = [
    ".pomelo-test.qG33zK/node-compile-cache/v24.21.0-x64-964aae3f-1000/03efb875",
    ".pomelo-test.qG33zK/node-compile-cache/v24.21.0-x64-964aae3f-1000/04b9e76e",
    ".pomelo-test.worker/output.txt",
    "scratch/node-compile-cache/entry",
    "node_modules/x/index.js",
    "nested/node_modules/x/index.js",
    ".env",
    ".env.local",
    "data.json",
    "logs/ab12.jsonl",
  ];
  const ordinary = [
    "src/pomelo/store.ts",
    "test/fixtures/qwen/success.json",
    "package.json",
    "docs/assets/logo.svg",
    "test/fixtures/.pomelo-test.example/output.txt",
    "docs/node-compile-cache.md",
    "docs/node_modules-guide.md",
    "test/fixtures/.env.local",
    "test/fixtures/data.json",
    "test/fixtures/logs/ab12.jsonl",
    "logs/archive/ab12.jsonl",
    "logs/README.md",
    ".environment",
  ];

  assert.deepEqual(junkPaths([...ordinary, ...junk]), junk);
});

test("the Git index contains no worker scratch files, caches or local state", (t) => {
  const root = resolve(import.meta.dirname, "..");
  if (!existsSync(resolve(root, ".git"))) return t.skip("the project folder is not a Git checkout");

  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
    return t.skip("git is not installed or is missing from PATH");
  }
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `git ls-files failed: ${result.stderr.trim()}`);

  const offenders = junkPaths(result.stdout.split("\0"));
  const examples = offenders.slice(0, 5).map((path) => JSON.stringify(path)).join(", ");
  assert.equal(offenders.length, 0, `Found ${offenders.length} tracked scratch or cache paths: ${examples}`);
});
