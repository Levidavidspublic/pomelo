import assert from "node:assert/strict";
import test from "node:test";
import { clockCheck } from "../src/pomelo/clock-check.js";

const remoteDateText = "Wed, 01 Jan 2020 00:00:00 GMT";
const remoteNowMs = 1_577_836_800_000;
const synchronized = "Timezone=Etc/UTC\r\nNTP=yes\r\nNTPSynchronized=yes\r\n";

test("a synchronized local clock two seconds ahead of GitHub can proceed", () => {
  assert.deepEqual(clockCheck({ timedatectlText: synchronized, localNowMs: remoteNowMs + 2_000, remoteDateText }), {
    verdict: "go", reasons: [], skewSeconds: 2,
  });
});

test("an unsynchronized local clock waits even with a small skew", () => {
  const result = clockCheck({
    timedatectlText: "NTP=yes\nNTPSynchronized=no\n", localNowMs: remoteNowMs, remoteDateText,
  });
  assert.equal(result.verdict, "wait");
  assert.equal(result.skewSeconds, 0);
  assert.match(result.reasons.join(" "), /local clock.*not synchronized/i);
});

test("a local clock 45 seconds behind GitHub waits", () => {
  const result = clockCheck({ timedatectlText: synchronized, localNowMs: remoteNowMs - 45_000, remoteDateText });
  assert.equal(result.verdict, "wait");
  assert.equal(result.skewSeconds, -45);
  assert.match(result.reasons.join(" "), /local clock.*45 seconds behind.*GitHub/i);
});

test("a local clock ten minutes ahead of or behind GitHub stops", () => {
  for (const [offsetMs, direction] of [[600_000, "ahead of"], [-600_000, "behind"]] as const) {
    const result = clockCheck({
      timedatectlText: synchronized, localNowMs: remoteNowMs + offsetMs, remoteDateText,
    });
    assert.equal(result.verdict, "stop");
    assert.equal(result.skewSeconds, offsetMs / 1_000);
    assert.match(result.reasons.join(" "), new RegExp(`local clock.*600 seconds ${direction}.*GitHub`, "i"));
  }
});

test("the skew limits are exclusive and a large skew overrides the synchronization wait", () => {
  const check = (offsetMs: number, timedatectlText = synchronized) => clockCheck({
    timedatectlText, localNowMs: remoteNowMs + offsetMs, remoteDateText,
  });
  assert.equal(check(30_000).verdict, "go");
  assert.equal(check(30_001).verdict, "wait");
  assert.equal(check(-300_000).verdict, "wait");
  assert.equal(check(-300_001).verdict, "stop");
  assert.equal(check(300_001, "NTPSynchronized=no").verdict, "stop");
});

test("missing or unreadable synchronization data stops even with a small skew", () => {
  for (const timedatectlText of [
    undefined, "", "Timezone=Etc/UTC\nNTP=yes", "NTPSynchronized=unknown", "NTPSynchronized=yes\nNTPSynchronized=no",
    "Failed to read clock status\nNTPSynchronized=yes",
  ]) {
    const result = clockCheck({ timedatectlText, localNowMs: remoteNowMs, remoteDateText });
    assert.equal(result.verdict, "stop", timedatectlText);
    assert.equal(result.skewSeconds, 0);
    assert.match(result.reasons.join(" "), /timedatectl.*NTPSynchronized/i);
  }
});

test("a missing or unreadable GitHub Date header stops without a skew", () => {
  for (const dateText of [undefined, "", "not a date", "2020", "Sat, 30 Feb 2020 00:00:00 GMT"]) {
    const result = clockCheck({ timedatectlText: synchronized, localNowMs: remoteNowMs, remoteDateText: dateText });
    assert.equal(result.verdict, "stop", dateText);
    assert.equal(result.skewSeconds, null);
    assert.match(result.reasons.join(" "), /GitHub.*Date/);
  }
});

test("an invalid local timestamp stops without a skew", () => {
  for (const localNowMs of [NaN, Infinity]) {
    const result = clockCheck({ timedatectlText: synchronized, localNowMs, remoteDateText });
    assert.equal(result.verdict, "stop");
    assert.equal(result.skewSeconds, null);
    assert.match(result.reasons.join(" "), /local clock/i);
  }
});
