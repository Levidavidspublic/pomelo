import assert from "node:assert/strict";
import { test } from "node:test";
import { gitConfigCheck } from "../src/pomelo/git-config.js";

const repoRoot = "/work/pomelo";
const local = ".git/config";
const global = "/config/worker profile/gitconfig";
const identity = [row(local, "user.name=Fixture Worker"), row(local, "user.email=fixture-identity")].join("\n");
const helperPath = "/tools/fixture-helper";
const rewriteBase = "https://destination.example.invalid/fixture-repo?mode=sample";
const rewriteSource = "https://source.example.invalid/fixture-repo";
const sshCommand = "fixture-ssh --custom-option";

function row(origin: string, setting: string): string {
  return `file:${origin}\t${setting}`;
}

function check(...settings: string[]) {
  return gitConfigCheck([identity, ...settings].join("\n"), { repoRoot });
}

test("allows a clean config with hooks inside the repository", () => {
  assert.deepEqual(gitConfigCheck(identity), { verdict: "go", problems: [] });
  const config = [
    identity,
    row(local, `core.hooksPath=${repoRoot}/.git/hooks`),
    row(local, "core.autocrlf=false"),
    row(local, "commit.gpgSign=off"),
    row(local, "tag.gpgSign=no"),
    row(local, "core.fsmonitor=true"),
    row(local, "credential.helper=cache"),
    row(local, "push.default=simple"),
    row(local, "core.filemode"),
    "",
  ].join("\r\n");
  assert.deepEqual(gitConfigCheck(config, { repoRoot }), { verdict: "go", problems: [] });
  assert.equal(check(row(local, "core.hooksPath=.githooks")).verdict, "go");
});

const riskySettings = [
  ["core.hooksPath=/external/hooks", "core.hookspath"],
  [`url.${rewriteBase}.insteadOf=${rewriteSource}`, "url.*.insteadof"],
  [`url.${rewriteBase}.pushInsteadOf=${rewriteSource}`, "url.*.pushinsteadof"],
  ["credential.helper=store --file=/tools/fixture-store", "credential.helper"],
  [`credential.helper=${helperPath}`, "credential.helper"],
  ["credential.helper=../tools/fixture-helper", "credential.helper"],
  ["core.autocrlf=true", "core.autocrlf"],
  ["core.autocrlf=input", "core.autocrlf"],
  ["commit.gpgSign=true", "commit.gpgsign"],
  ["tag.gpgSign=yes", "tag.gpgsign"],
  ["core.fsmonitor=fixture-monitor --quiet", "core.fsmonitor"],
  [`core.sshCommand=${sshCommand}`, "core.sshcommand"],
  ["push.default=matching", "push.default"],
];

test("reports each risky setting and the file that supplied it", () => {
  for (const [setting, key] of riskySettings) {
    const result = check(row(global, setting));
    assert.equal(result.verdict, "stop", key);
    assert.deepEqual(result.problems.map(({ key, origin }) => ({ key, origin })), [{ key, origin: global }]);
    assert.ok(result.problems[0].reason.length > 0, key);
  }

  const result = check(...riskySettings.map(([setting]) => row(global, setting)));
  assert.deepEqual(result.problems.map(({ key }) => key), [
    "core.hookspath",
    "url.*.insteadof",
    "url.*.pushinsteadof",
    "credential.helper",
    "credential.helper",
    "credential.helper",
    "core.autocrlf",
    "commit.gpgsign",
    "tag.gpgsign",
    "core.fsmonitor",
    "core.sshcommand",
    "push.default",
  ]);
});

test("reports a URL-scoped credential helper without exposing its scope", () => {
  for (const scope of ["https://destination.example.invalid", rewriteBase]) {
    const result = check(row(global, `Credential.${scope}.Helper=store`));
    assert.equal(result.verdict, "stop");
    assert.deepEqual(result.problems.map(({ key, origin }) => [key, origin]), [["credential.*.helper", global]]);
    assert.ok(!JSON.stringify(result).includes("destination.example.invalid"));
  }
});

test("reports an earlier credential helper that remains active alongside a later one", () => {
  const result = check(row(global, "credential.helper=store"), row(local, "CREDENTIAL.HELPER=cache"));
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems.map(({ key, origin }) => [key, origin]), [["credential.helper", global]]);
});

test("honors an empty helper reset wherever it applies", () => {
  const scopedHelper = `credential.${rewriteBase}.helper`;
  const unscoped = row(global, "credential.helper=store");
  const scoped = row(global, `${scopedHelper}=${helperPath}`);
  const scopedReset = row(local, `${scopedHelper}=`);
  const globalReset = row(local, "credential.helper=");
  const cache = row(local, "credential.helper=cache");

  assert.deepEqual(check(scoped, scopedReset), { verdict: "go", problems: [] });
  assert.deepEqual(check(unscoped, scoped, globalReset, cache), { verdict: "go", problems: [] });
  const result = check(unscoped, scoped, scopedReset, cache);
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems.map(({ key, origin }) => [key, origin]), [["credential.helper", global]]);
});

test("keeps config values and URL subsections out of the result", () => {
  const result = check(
    row(global, `credential.helper=${helperPath}`),
    row(global, `url.${rewriteBase}.insteadOf=${rewriteSource}`),
    row(global, `core.sshCommand=${sshCommand}`),
  );
  assert.equal(result.problems.length, 3);
  for (const value of [helperPath, rewriteBase, rewriteSource, "destination.example.invalid", sshCommand]) {
    assert.ok(!JSON.stringify(result).includes(value));
  }
});

test("matches keys case-insensitively and checks the last setting and its origin", () => {
  const config = [
    "file:.git/config\tUSER.NAME=Fixture Worker",
    "file:.git/config\tUser.Email=fixture-identity",
    row(global, "CORE.AUTOCRLF=TRUE"),
    row(local, "core.AutoCrlf=false"),
    row(global, "Push.Default=simple"),
    row(local, "PUSH.DEFAULT=MATCHING"),
  ].join("\n");
  const result = gitConfigCheck(config);
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems.map(({ key, origin }) => [key, origin]), [["push.default", local]]);
});

test("rejects parent traversal, sibling directories and hooks paths without a repo root", () => {
  for (const path of [".git/../../hooks", "/work/pomelo-other/hooks", "~/hooks"]) {
    assert.equal(check(row(local, `core.hooksPath=${path}`)).verdict, "stop");
  }
  assert.equal(gitConfigCheck(`${identity}\n${row(local, "core.hooksPath=.githooks")}`).verdict, "stop");
  const winRepo = { repoRoot: "C:\\work\\pomelo" };
  assert.equal(gitConfigCheck(`${identity}\n${row(local, "core.hooksPath=.git\\hooks")}`, winRepo).verdict, "go");
  assert.equal(gitConfigCheck(`${identity}\n${row(local, "core.hooksPath=D:\\hooks")}`, winRepo).verdict, "stop");
});

test("accepts an explicitly expected line-ending mode and signing with a configured key", () => {
  const config = [
    identity,
    row(local, "core.autocrlf=input"),
    row(local, "commit.gpgSign"),
    row(local, "tag.gpgSign=1"),
    row(local, "user.signingKey=fixture-reference"),
  ].join("\n");
  assert.deepEqual(gitConfigCheck(config, { expectedAutoCrlf: "input" }), { verdict: "go", problems: [] });
  const result = gitConfigCheck(config + "\n" + row(local, "user.signingkey="), { expectedAutoCrlf: "input" });
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems.map(({ key }) => key), ["commit.gpgsign", "tag.gpgsign"]);
});

test("reports missing and blank identity fields without returning identity values", () => {
  const missing = gitConfigCheck(row(local, "push.default=simple"));
  assert.equal(missing.verdict, "stop");
  assert.deepEqual(missing.problems.map(({ key, origin }) => [key, origin]), [["user.name", null], ["user.email", null]]);

  const blank = check(row(global, "user.name=  "), row(global, "user.email="));
  assert.equal(blank.verdict, "stop");
  assert.deepEqual(blank.problems.map(({ key, origin }) => [key, origin]), [["user.name", global], ["user.email", global]]);
});

test("stops on empty, non-file or malformed output without repeating raw text", () => {
  for (const config of ["", " \r\n", "user.name=Fixture Worker\nuser.email=fixture-identity", "command line:\tuser.name=Fixture Worker"]) {
    const result = gitConfigCheck(config);
    assert.equal(result.verdict, "stop");
    assert.match(result.problems[0].reason, /empty|file origin/i);
  }

  for (const line of ["unreadable-fixture-row", row(local, "unreadable-fixture-row"), "command line:\tcore.sshcommand=unreadable-fixture-row"]) {
    const result = gitConfigCheck(`${identity}\n${line}`);
    assert.equal(result.verdict, "stop");
    assert.match(result.problems[0].reason, /line 3/i);
    assert.ok(!JSON.stringify(result).includes("unreadable-fixture-row"));
  }
});
