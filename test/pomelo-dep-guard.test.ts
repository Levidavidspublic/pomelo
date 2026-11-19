import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { depProblems, FRIDAY_BASELINE } from "../src/pomelo/dep-guard.js";

const manifest: Parameters<typeof depProblems>[0] = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("reports Never packages across dependency sections and matches them case-insensitively", () => {
  assert.deepEqual(depProblems({
    dependencies: {
      openai: "*",
      OpenRouter: "*",
      "@OpenRouter/sdk": "*",
    },
    devDependencies: {
      "n8n": "*",
      "N8N-nodes-base": "*",
      "@n8n/core": "*",
    },
    optionalDependencies: {
      composio: "*",
      "@COMPOSIO/core": "*",
      "browser-use": "*",
      openai: "*",
    },
  }), [
    { name: "@COMPOSIO/core", reason: "never" },
    { name: "@OpenRouter/sdk", reason: "never" },
    { name: "@n8n/core", reason: "never" },
    { name: "N8N-nodes-base", reason: "never" },
    { name: "OpenRouter", reason: "never" },
    { name: "browser-use", reason: "never" },
    { name: "composio", reason: "never" },
    { name: "n8n", reason: "never" },
    { name: "openai", reason: "never" },
  ]);
});

test("reports an unknown package only once across dependency sections", () => {
  assert.deepEqual(depProblems({
    devDependencies: { "unknown-package-fixture": "*" },
    optionalDependencies: { "unknown-package-fixture": "*" },
  }), [
    { name: "unknown-package-fixture", reason: "not_listed" },
  ]);
});

test("reports names that only resemble Never packages as not listed", () => {
  assert.deepEqual(depProblems({
    dependencies: {
      "openai-like-name-fixture": "*",
      "my-n8n": "*",
      "@openrouter-fixture/sdk": "*",
      "browser-use-fixture": "*",
      "composio-fixture": "*",
    },
  }), [
    { name: "@openrouter-fixture/sdk", reason: "not_listed" },
    { name: "browser-use-fixture", reason: "not_listed" },
    { name: "composio-fixture", reason: "not_listed" },
    { name: "my-n8n", reason: "not_listed" },
    { name: "openai-like-name-fixture", reason: "not_listed" },
  ]);
});

test("the repository package.json has no dependency problems", () => {
  assert.deepEqual(depProblems(manifest), []);
});

test("the repository package.json still includes every Friday baseline dependency", () => {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  assert.deepEqual(FRIDAY_BASELINE.filter((name) => !names.has(name)), []);
});
