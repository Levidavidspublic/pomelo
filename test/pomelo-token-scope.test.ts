import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTokenScopes } from "../src/pomelo/token-scope.js";

const opts = { allowedAccounts: ["example-kitchen-fixture"] };

function account(scopes: string | null, { name = opts.allowedAccounts[0], active = true, token = "gho_********" } = {}): string {
  return [
    `  ✓ Logged in to github.com account ${name} (keyring)`,
    `  - Active account: ${active}`,
    "  - Git operations protocol: https",
    `  - Token: ${token}`,
    ...(scopes === null ? [] : [`  - Token scopes: ${scopes}`]),
  ].join("\n");
}

function status(...accounts: string[]): string {
  return ["github.com", ...accounts, ""].join("\n");
}

test("allows an approved active account with only repo scope", () => {
  const expected = { verdict: "go", problems: [] };
  assert.deepEqual(checkTokenScopes(status(account("'repo'")), opts), expected);
  assert.deepEqual(checkTokenScopes(status(account("'repo'", { token: "********" })), opts), expected);
});

test("reads the older single-account status format without an active flag", () => {
  const input = status(account("'repo'")
    .replace("github.com account", "github.com as")
    .replace("  - Active account: true\n", ""));
  assert.deepEqual(checkTokenScopes(input, opts), { verdict: "go", problems: [] });
});

test("names workflow as too wide", () => {
  assert.deepEqual(checkTokenScopes(status(account("'repo', 'workflow'")), opts), {
    verdict: "stop",
    problems: ["scope too wide: workflow"],
  });
});

test("names each of the other scopes that is too wide", () => {
  const result = checkTokenScopes(status(account("'repo', 'admin:org', 'delete_repo', 'write:packages', 'delete:packages'")), opts);
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems, [
    "scope too wide: admin:org",
    "scope too wide: delete_repo",
    "scope too wide: write:packages",
    "scope too wide: delete:packages",
  ]);
});

test("names a missing repo scope even when another scope is too wide", () => {
  assert.deepEqual(checkTokenScopes(status(account("'repo:status', 'workflow'")), opts), {
    verdict: "stop",
    problems: ["missing scope: repo", "scope too wide: workflow"],
  });
});

test("uses caller-provided required and too-wide scopes", () => {
  assert.deepEqual(checkTokenScopes(status(account("'repo', 'write:discussion', 'write:discussion'")), {
    ...opts,
    neededScopes: ["read:org", "repo:status"],
    tooWideScopes: ["write:discussion"],
  }), {
    verdict: "stop",
    problems: ["missing scope: read:org", "missing scope: repo:status", "scope too wide: write:discussion"],
  });
});

test("stops when gh reports no login or a failed active login", () => {
  for (const input of [
    "You are not logged into any GitHub hosts. To log in, run: gh auth login",
    status(account("'repo'").replace("✓ Logged in to", "X Failed to log in to")),
  ]) {
    assert.deepEqual(checkTokenScopes(input, opts), {
      verdict: "stop",
      problems: ["not logged in"],
    });
  }
});

test("stops when the active account is outside the allow list", () => {
  const input = status(account("'repo'", { name: "example-unapproved-fixture" }));
  assert.deepEqual(checkTokenScopes(input, opts), {
    verdict: "stop",
    problems: ["active account is not allowed"],
  });
});

test("checks account and scope policy only for the active account", () => {
  const inactive = account("'workflow'", { name: "example-unapproved-fixture", active: false });
  const active = account("'repo'");
  for (const input of [status(inactive, active), status(active, inactive)]) {
    assert.deepEqual(checkTokenScopes(input, opts), { verdict: "go", problems: [] });
  }
});

test("stops when scopes are unknown, even with a readable inactive account", () => {
  const inactive = account("'repo'", { name: "example-unapproved-fixture", active: false });
  for (const scopes of [null, "", "'repo', 'workflow"]) {
    assert.deepEqual(checkTokenScopes(status(account(scopes), inactive), opts), {
      verdict: "stop",
      problems: ["unknown scopes"],
    });
  }
});

test("stops when more than one account is active", () => {
  assert.deepEqual(checkTokenScopes(status(account("'repo'"), account("'repo'")), opts), {
    verdict: "stop",
    problems: ["multiple active accounts"],
  });
});

test("reports empty, non-string and unrecognized status text as unreadable", () => {
  for (const input of ["", " \n\t", null, undefined, 42, {}, "unrelated output"]) {
    assert.deepEqual(checkTokenScopes(input, opts), {
      verdict: "unreadable",
      problems: ["could not read auth status"],
    });
  }
});

test("reads Windows and Unix line endings the same way", () => {
  const input = status(account("'repo', 'workflow'"));
  assert.deepEqual(checkTokenScopes(input.replaceAll("\n", "\r\n"), opts), checkTokenScopes(input, opts));
});

test("stops for an unmasked token anywhere in the status without repeating any of it", () => {
  const fakeToken = "ghp_" + "Z9q7V6k4Y3w2U8r5S0n1M6a4K3i2X8b7C5d0";
  const active = account("'repo'");
  for (const input of [
    status(account("'repo', 'workflow'", { token: fakeToken })),
    status(active, account("'repo'", { token: fakeToken, active: false })),
    `  - Token: ${fakeToken}`,
  ]) {
    const result = checkTokenScopes(input, opts);
    assert.deepEqual(result, { verdict: "stop", problems: ["token shown"] });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(fakeToken), false);
    for (let i = 0; i <= fakeToken.length - 5; i++) {
      assert.equal(serialized.includes(fakeToken.slice(i, i + 5)), false);
    }
  }
});

test("does not repeat a token-shaped value placed in the scopes field", () => {
  const fakeToken = "ghp_" + "z9q7v6k4y3w2u8r5s0n1m6a4k3i2x8b7c5d0";
  const result = checkTokenScopes(status(account(`'repo', 'admin:${fakeToken}'`)), opts);
  assert.deepEqual(result, { verdict: "stop", problems: ["unknown scopes"] });
  assert.equal(JSON.stringify(result).includes(fakeToken), false);
});
