import assert from "node:assert/strict";
import test from "node:test";
import { checkUpstreamRemote } from "../src/pomelo/upstream-remote-rule.js";

const fork = "https://github.com/Division6066/pomelo.git";
const friday = "https://github.com/splashxmoon/friday.git";
const origin = `origin\t${fork} (fetch)\norigin\t${fork} (push)`;
const upstream = `upstream\t${friday} (fetch)\nupstream\tno_push (push)`;
const good = `${origin}\n${upstream}`;

test("checkUpstreamRemote accepts the fork and a disabled upstream push", () => {
  assert.deepEqual(checkUpstreamRemote(good), { ok: true, problems: [] });
  assert.deepEqual(checkUpstreamRemote(good.replace("no_push", "DISABLED")), { ok: true, problems: [] });
});

test("checkUpstreamRemote accepts HTTPS and SSH with varied case, spacing and line endings", () => {
  const text = [
    "origin  git+https://github.com/division6066/Pomelo   (fetch)",
    "origin\tgit@github.com:DIVISION6066/pomelo.git\t(push)",
    "upstream \t ssh://git@github.com/SPLASHXMOON/Friday.GIT (fetch)",
    "upstream  DISABLED (push)",
    "",
  ].join("\r\n");
  assert.deepEqual(checkUpstreamRemote(text), { ok: true, problems: [] });
});

test("checkUpstreamRemote identifies missing remotes and missing directions", () => {
  assert.deepEqual(problemCodes(origin), [["upstream", "missing-upstream"]]);
  assert.deepEqual(problemCodes(upstream), [["origin", "missing-origin"]]);
  assert.deepEqual(problemCodes(""), [["upstream", "missing-upstream"], ["origin", "missing-origin"]]);
  assert.deepEqual(problemCodes(`${origin}\nupstream  ${friday} (fetch)`), [["upstream", "upstream-push-enabled"]]);
  assert.deepEqual(problemCodes(`${origin}\nupstream  DISABLED (push)`), [["upstream", "wrong-upstream-fetch"]]);
  assert.deepEqual(problemCodes(`origin  ${fork} (fetch)\n${upstream}`), [["origin", "wrong-origin"]]);
});

test("checkUpstreamRemote rejects the fork and other repositories as the upstream fetch", () => {
  for (const address of [fork, "git@github.com:example/friday", "https://github.com/splashxmoon/another-repo"]) {
    assert.deepEqual(problemCodes(`${origin}\nupstream  ${address} (fetch)\nupstream  DISABLED (push)`), [
      ["upstream", "wrong-upstream-fetch"],
    ]);
  }
});

test("checkUpstreamRemote rejects upstream push destinations and wrong origin directions", () => {
  for (const address of [friday, fork, "./local-repo", "https://github.com/example/no_push"]) {
    assert.deepEqual(problemCodes(good.replace("no_push", address)), [["upstream", "upstream-push-enabled"]]);
  }
  for (const direction of ["fetch", "push"]) {
    assert.deepEqual(problemCodes(good.replace(`${fork} (${direction})`, `${friday} (${direction})`)), [
      ["origin", "wrong-origin"],
    ]);
  }
});

test("checkUpstreamRemote detects different addresses for the same remote and direction", () => {
  assert.deepEqual(checkUpstreamRemote(`${good}\n${good}`), { ok: true, problems: [] });
  const text = `${good}\nupstream  DISABLED (push)\nmirror  ${fork} (fetch)\nmirror  ${friday} (fetch)`;
  assert.deepEqual(problemCodes(text), [
    ["upstream", "conflicting-addresses"],
    ["mirror", "conflicting-addresses"],
  ]);
  assert.deepEqual(problemCodes(`${good}\nupstream  ${friday} (push)`), [
    ["upstream", "conflicting-addresses"],
    ["upstream", "upstream-push-enabled"],
  ]);
});

test("checkUpstreamRemote allows independent overrides for the expected repositories", () => {
  const text = good.replaceAll("Division6066/pomelo", "example/fork").replace("splashxmoon/friday", "example/upstream");
  assert.deepEqual(checkUpstreamRemote(text, { upstreamRepo: "EXAMPLE/UPSTREAM", originRepo: "EXAMPLE/FORK" }), {
    ok: true,
    problems: [],
  });
  assert.deepEqual(checkUpstreamRemote(good.replaceAll("Division6066/pomelo", "example/fork"), { originRepo: "example/fork" }), {
    ok: true,
    problems: [],
  });
});

test("checkUpstreamRemote masks credentials in address diagnostics", () => {
  const token = "obviously-fake-token-for-this-test";
  const withUserinfo = `https://${token}@github.com/splashxmoon/friday.git`;
  const withPassword = `https://fake-user:${token}@github.com/splashxmoon/friday.git`;
  const withQuery = `${friday}?access_token=${token}`;
  const withPathToken = `https://github.com/example/${token}`;
  assert.deepEqual(checkUpstreamRemote(good.replace(friday, withUserinfo)), { ok: true, problems: [] });
  for (const address of [withUserinfo, withPassword, withQuery, withPathToken, token]) {
    const result = checkUpstreamRemote(`${good}\nupstream  ${address} (push)`);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /obviously-fake-token-for-this-test|fake-user/);
    for (const problem of result.problems) assert.match(problem.message, /\*\*\*/);
  }
  const result = checkUpstreamRemote(good.replace("no_push", withPassword));
  assert.match(result.problems[0].message, /https:\/\/\*\*\*@github\.com\/splashxmoon\/friday\.git/);
});

function problemCodes(text: string): string[][] {
  const result = checkUpstreamRemote(text);
  assert.equal(result.ok, false);
  return result.problems.map(({ remote, code }) => [remote, code]);
}
