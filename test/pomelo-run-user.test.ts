import assert from "node:assert/strict";
import test from "node:test";
import { RISKY_GROUPS, runUserCheck } from "../src/pomelo/run-user.js";

const worker = "uid=1001(kitchen) gid=1001(kitchen)";
const regular = `${worker} groups=1001(kitchen)`;

test("a regular worker can run, including with trailing spaces and CRLF", () => {
  const expected = { action: "go", user: "kitchen", reasons: [] };
  assert.deepEqual(runUserCheck(regular), expected);
  assert.deepEqual(runUserCheck(`${regular}  \r\n`), expected);
});

test("UID 0 stops the run and names the worker", () => {
  const result = runUserCheck("uid=0(kitchen) gid=1001(kitchen) groups=1001(kitchen)");
  assert.equal(result.action, "stop");
  assert.equal(result.user, "kitchen");
  assert.match(result.reasons[0], /kitchen.*root/);
});

test("each risky group stops the run and is named in its own reason", () => {
  const groups = ["root", "sudo", "wheel", "admin", "docker", "lxd", "disk"];
  assert.deepEqual(RISKY_GROUPS, groups);
  assert.ok(Object.isFrozen(RISKY_GROUPS));

  const members = groups.map((group, index) => {
    const member = `${2000 + index}(${group})`;
    const result = runUserCheck(`${regular},${member}`);
    assert.equal(result.action, "stop", group);
    assert.match(result.reasons[0], new RegExp(`kitchen.*\\b${group}\\b`));
    return member;
  });
  const result = runUserCheck(`${regular},${members.join(",")}`);
  assert.equal(result.action, "stop");
  assert.equal(result.user, "kitchen");
  assert.equal(result.reasons.length, groups.length);
  for (const group of groups) {
    assert.ok(result.reasons.some((reason) => new RegExp(`kitchen.*\\b${group}\\b`).test(reason)));
  }
});

test("a risky primary group stops the run even when absent from the supplementary list", () => {
  const result = runUserCheck("uid=1001(kitchen) gid=27(sudo) groups=1001(kitchen)");
  assert.equal(result.action, "stop");
  assert.match(result.reasons[0], /kitchen.*sudo/);
});

test("an unnamed GID 0 stops the run in either group field", () => {
  for (const text of [`${regular},0`, "uid=1001(kitchen) gid=0 groups=27"]) {
    const result = runUserCheck(text);
    assert.equal(result.action, "stop");
    assert.ok(result.reasons.some((reason) => /kitchen.*root.*\b0\b/.test(reason)));
  }
});

test("an unnamed nonzero group is unreadable and stops the run", () => {
  const result = runUserCheck(`${worker} groups=27`);
  assert.equal(result.action, "stop");
  assert.match(result.reasons[0], /could not read.*27.*kitchen/i);
});

test("a group name can contain a risky word", () => {
  assert.deepEqual(runUserCheck(`${regular},2000(dockerdocs)`), {
    action: "go",
    user: "kitchen",
    reasons: [],
  });
});

test("effective root IDs stop the run", () => {
  const effectiveUser = runUserCheck("uid=1001(kitchen) euid=0(root) gid=1001(kitchen) groups=1001(kitchen)");
  assert.equal(effectiveUser.action, "stop");
  assert.match(effectiveUser.reasons[0], /kitchen.*root/);

  const effectiveGroup = runUserCheck(`${worker} egid=0 groups=1001(kitchen)`);
  assert.equal(effectiveGroup.action, "stop");
  assert.match(effectiveGroup.reasons[0], /kitchen.*root.*\b0\b/);
});

test("id output can include an SELinux context", () => {
  const result = runUserCheck(`${regular} context=unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023`);
  assert.equal(result.action, "go");
});

test("empty, incomplete, or broken id output stops the run", () => {
  for (const text of [
    "", "  \r\n", null, 1001, { uid: 1001 }, "gid=1001(kitchen) groups=1001(kitchen)", worker,
    `${worker} groups=`, `${regular},27(sudo`, `${regular},`, `${regular} uid=0(root)`,
    `${regular}\n${regular}`, regular.replace("uid=1001", "uid=-1"),
  ]) {
    const result = runUserCheck(text);
    assert.equal(result.action, "stop");
    assert.match(result.reasons[0], /could not read/i);
  }
});
