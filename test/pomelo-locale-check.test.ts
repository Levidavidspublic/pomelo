import assert from "node:assert/strict";
import test from "node:test";
import { localeCheck } from "../src/pomelo/locale-check.js";

const utf8Report = [
  "LANG=en_US.UTF-8",
  "LANGUAGE=",
  ...[
    "LC_CTYPE", "LC_NUMERIC", "LC_TIME", "LC_COLLATE", "LC_MONETARY", "LC_MESSAGES",
    "LC_PAPER", "LC_NAME", "LC_ADDRESS", "LC_TELEPHONE", "LC_MEASUREMENT", "LC_IDENTIFICATION",
  ].map((setting) => `${setting}="en_US.UTF-8"`),
  "LC_ALL=",
  "",
].join("\n");

test("a UTF-8 locale and UTC can proceed", () => {
  assert.deepEqual(localeCheck({ localeText: utf8Report, tz: "UTC" }), { decision: "go", problems: [] });
});

test("C and POSIX stop when LANG supplies the character set", () => {
  for (const value of ["C", "POSIX"]) {
    const result = localeCheck({ localeText: `LANG=${value}`, tz: "UTC" });
    assert.equal(result.decision, "stop");
    assert.deepEqual(result.problems.map(({ setting }) => setting), ["LANG"]);
    assert.match(result.problems[0].reason, /LANG.*UTF-8/);
  }
});

test("LC_ALL takes precedence over LC_CTYPE and LANG", () => {
  const result = localeCheck({ localeText: 'LANG=en_US.UTF-8\nLC_CTYPE="en_US.UTF-8"\nLC_ALL=C', tz: "UTC" });
  assert.equal(result.decision, "stop");
  assert.deepEqual(result.problems.map(({ setting }) => setting), ["LC_ALL"]);
  assert.deepEqual(localeCheck({ localeText: "LANG=C\nLC_CTYPE=C\nLC_ALL=C.UTF-8", tz: "UTC" }), {
    decision: "go", problems: [],
  });
});

test("LC_CTYPE takes precedence over LANG when LC_ALL is empty", () => {
  const result = localeCheck({ localeText: 'LANG=en_US.UTF-8\nLC_CTYPE="en_US.ISO-8859-1"\nLC_ALL=', tz: "UTC" });
  assert.equal(result.decision, "stop");
  assert.deepEqual(result.problems.map(({ setting }) => setting), ["LC_CTYPE"]);
  assert.match(result.problems[0].reason, /LC_CTYPE.*ISO-8859-1/);
  assert.deepEqual(localeCheck({ localeText: 'LANG=POSIX\nLC_CTYPE="he_IL.utf8"\nLC_ALL=""', tz: "UTC" }), {
    decision: "go", problems: [],
  });
});

test("quoted locale values, UTF-8 spellings, and Windows line endings are read", () => {
  for (const value of ["C.UTF-8", "he_IL.utf8", "en_US.UTF-8@modifier"]) {
    const result = localeCheck({ localeText: `LANG="${value}"\r\nLC_CTYPE=""\r\nLC_ALL=\r\n`, tz: "UTC" });
    assert.deepEqual(result, { decision: "go", problems: [] });
  }
});

test("a Cannot set warning stops even when the report lists UTF-8", () => {
  const result = localeCheck({
    localeText: `${utf8Report}locale: Cannot set LC_ALL to default locale: No such file or directory\n`,
    tz: "UTC",
  });
  assert.equal(result.decision, "stop");
  assert.deepEqual(result.problems.map(({ setting }) => setting), ["LC_ALL"]);
  assert.match(result.problems[0].reason, /cannot set LC_ALL/i);
});

test("empty, missing, or unreadable locale reports stop", () => {
  for (const localeText of [
    "", " \r\n", "LANGUAGE=en_US", 'LC_TIME="en_US.UTF-8"', "LANG=\nLC_CTYPE=\nLC_ALL=", 42,
    'LANG=en_US.UTF-8\nLC_ALL="', "LANG=en_US.UTF-8\nLANG=C", `${utf8Report}locale: command failed`,
  ]) {
    const result = localeCheck({ localeText, tz: "UTC" });
    assert.equal(result.decision, "stop", String(localeText));
    assert.ok(result.problems.length > 0);
    assert.ok(result.problems.every(({ setting, reason }) => reason.includes(setting)));
  }
});

test("TZ must match the kitchen's chosen time zone", () => {
  const result = localeCheck({ localeText: utf8Report, tz: "Asia/Jerusalem", expectedTz: "UTC" });
  assert.equal(result.decision, "stop");
  assert.deepEqual(result.problems.map(({ setting }) => setting), ["TZ"]);
  assert.match(result.problems[0].reason, /TZ.*Asia\/Jerusalem/);
  assert.deepEqual(localeCheck({ localeText: utf8Report, tz: "Asia/Jerusalem", expectedTz: "Asia/Jerusalem" }), {
    decision: "go", problems: [],
  });
});

test("missing TZ stops, and locale and time zone problems are both reported", () => {
  const result = localeCheck({ localeText: utf8Report, expectedTz: "UTC" });
  assert.equal(result.decision, "stop");
  assert.deepEqual(result.problems.map(({ setting }) => setting), ["TZ"]);
  assert.match(result.problems[0].reason, /TZ.*not set/);

  const both = localeCheck({ localeText: "LANG=C", tz: "Asia/Jerusalem" });
  assert.equal(both.decision, "stop");
  assert.deepEqual(both.problems.map(({ setting }) => setting), ["LANG", "TZ"]);
});
