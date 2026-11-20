import assert from "node:assert/strict";
import test from "node:test";
import { leftoverProcs } from "../src/pomelo/leftover-procs.js";

const opts = {
  workerRoot: "/work",
  liveWorkerDirs: ["/work/w1"],
  protectedPids: [40],
  minAgeSeconds: 300,
};

test("names old worker processes by kind and sorts them by pid", () => {
  const { leftovers, unreadableLines } = leftoverProcs(`
    34 1 900 /usr/bin/redis-server /work/w2/redis.conf --port 16379
    32 1 600 node /work/w10/node_modules/tsx/dist/cli.mjs --import ./test/css.mjs --test test/check.test.ts
    35 1 500 /usr/bin/chromium --user-data-dir=/work/w2/chromium-profile
    33 1 450 node /work/w2/scripts/test.mjs test/check.test.ts
    36 1 400 /usr/bin/tool /work/w2
    37 1 350 /usr/bin/node --import tsx /work/w2/test/check.test.ts
  `, { ...opts, workerRoot: "/work/" });

  assert.equal(unreadableLines, 0);
  assert.deepEqual(leftovers.map(({ reason, ...entry }) => entry), [
    { pid: 32, kind: "test", workerDir: "/work/w10", ageSeconds: 600 },
    { pid: 33, kind: "test", workerDir: "/work/w2", ageSeconds: 450 },
    { pid: 34, kind: "redis", workerDir: "/work/w2", ageSeconds: 900 },
    { pid: 35, kind: "browser", workerDir: "/work/w2", ageSeconds: 500 },
    { pid: 36, kind: "other", workerDir: "/work/w2", ageSeconds: 400 },
    { pid: 37, kind: "test", workerDir: "/work/w2", ageSeconds: 350 },
  ]);
  for (const { reason } of leftovers) assert.match(reason, /no live worker/i);
});

test("leaves live, young, protected and unattributed processes out", () => {
  assert.deepEqual(leftoverProcs(`
    38 1 900 node /work/w1/scripts/test.mjs
    39 1 299 node /work/w2/scripts/test.mjs
    40 1 900 node /work/w2/scripts/test.mjs
    41 40 900 node /work/w2/scripts/test.mjs
    42 1 900 node /srv/friday/scripts/test.mjs
    43 1 300 node /work/w2/scripts/test.mjs
    44 1 900 node /work-backup/w2/scripts/test.mjs
    45 1 900 node /tmp/work/w2/scripts/test.mjs
    46 1 900 node /work/w2/../../srv/friday/scripts/test.mjs
    47 1 900 node /work/w2/scripts/test.mjs /work/w1/test/check.test.ts
    48 49 900 chromium --user-data-dir=/work/w2/chromium-profile
    49 40 900 node /srv/friday/server.js
    50 1 900 redis-server 127.0.0.1:16379
    51 1 900 tool --url=https://example.invalid/work/w2
    52 1 900 node /work/w2/scripts/test.mjs /work/w3/test/check.test.ts
  `, { ...opts, liveWorkerDirs: new Set(["/work/w1/"]) }), { leftovers: [], unreadableLines: 0 });
});

test("counts malformed rows and keeps raw arguments out of the result", () => {
  const canary = "tok_fixture_00000000000000000000";
  const result = leftoverProcs([
    "  PID  PPID  ELAPSED  COMMAND",
    "",
    "not a process row",
    "52 1 900",
    "0 1 900 invalid-pid",
    "53 1 -10 invalid-age",
    `  54  1  900  chromium --user-data-dir="/work/w2/profile with spaces" --token=${canary}`,
    "",
  ].join("\r\n"), opts);

  assert.equal(result.unreadableLines, 4);
  assert.deepEqual(result.leftovers.map(({ pid, kind, workerDir }) => ({ pid, kind, workerDir })), [
    { pid: 54, kind: "browser", workerDir: "/work/w2" },
  ]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${canary}|--token|--user-data-dir|profile with spaces`));
});
