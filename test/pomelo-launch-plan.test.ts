import assert from "node:assert/strict";
import test from "node:test";
import { buildLaunchPlan } from "../src/pomelo/browser/launch-plan.js";

const pc = {
  profileDir: "/tmp/pomelo profiles/work",
  location: "pc",
  headless: false,
  debuggingPort: 9222,
} as const;
const vps = { ...pc, profileDir: "/data/cloud-browser/profile/work", location: "vps", headless: true } as const;
const companionExtensionPath = "/tmp/pomelo extensions/companion";

function refusal(input: unknown): { flag: string; reason: string }[] {
  const result = buildLaunchPlan(input);
  assert.equal(result.ok, false);
  return result.refused;
}

test("a PC plan fixes the profile and debugging endpoint and disables password prompts and sync", () => {
  const plan = buildLaunchPlan(pc);
  assert.ok(plan.ok);
  assert.deepEqual(plan.args, [
    `--user-data-dir=${pc.profileDir}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=9222",
    "--enable-automation",
    "--disable-sync",
  ]);
  assert.deepEqual(plan.env, {});
  assert.ok(Object.keys(plan.env).every((key) => !/token|password|secret|key/i.test(key)));
});

test("a VPS plan can be headless and accept an explicit sandbox opt-out", () => {
  const plan = buildLaunchPlan({ ...vps, extraFlags: ["--no-sandbox"] });
  assert.ok(plan.ok);
  assert.ok(plan.args.includes(`--user-data-dir=${vps.profileDir}`));
  assert.ok(plan.args.includes("--headless"));
  assert.ok(plan.args.includes("--no-sandbox"));
  assert.ok(plan.args.includes("--remote-debugging-address=127.0.0.1"));
});

test("unsafe flags are refused by name with distinct reasons", () => {
  const cases = [
    ["--disable-web-security", "--disable-web-security"],
    ["--ignore-certificate-errors=true", "--ignore-certificate-errors"],
    ["--allow-running-insecure-content", "--allow-running-insecure-content"],
    ["--remote-debugging-address=0.0.0.0", "--remote-debugging-address"],
    ["--remote-allow-origins=*", "--remote-allow-origins"],
    ["--no-sandbox", "--no-sandbox"],
    ["--load-extension=/tmp/other", "--load-extension"],
    ["--disable-extensions-except=/tmp/other", "--disable-extensions-except"],
    ["--user-data-dir=/tmp/other", "--user-data-dir"],
    ["--enable-logging=stderr", "--enable-logging"],
    ["--log-net-log=/tmp/netlog", "--log-net-log"],
  ];
  const refused = refusal({ ...pc, companionExtensionPath, extraFlags: cases.map(([arg]) => arg) });
  assert.deepEqual(refused.map(({ flag }) => flag), cases.map(([, name]) => name));
  assert.ok(refused.every(({ reason }) => reason.length > 0));
  assert.equal(new Set(refused.map(({ reason }) => reason)).size, cases.length);
});

test("loopback requests still produce a single literal IPv4 loopback address", () => {
  for (const address of ["127.0.0.1", "localhost", "::1", "[::1]"]) {
    const plan = buildLaunchPlan({ ...pc, extraFlags: [`--remote-debugging-address=${address}`] });
    assert.ok(plan.ok);
    assert.deepEqual(plan.args.filter((arg) => arg.startsWith("--remote-debugging-address")), [
      "--remote-debugging-address=127.0.0.1",
    ]);
  }

  for (const address of ["", "::", "localhost.example.invalid", "127.0.0.1:9222"]) {
    assert.equal(refusal({ ...pc, extraFlags: [`--remote-debugging-address=${address}`] })[0].flag,
      "--remote-debugging-address");
  }
});

test("extra flags cannot replace the profile, debug port or startup protections", () => {
  const extraFlags = [
    `--user-data-dir=${pc.profileDir}`,
    "--remote-debugging-port=9999",
    "--remote-debugging-pipe",
    "--disable-features=ExampleFeature",
    "--remote-allow-origins=https://example.invalid",
    "--no-first-run=unexpected",
    "--unknown-option=fixture-value",
  ];
  const refused = refusal({ ...pc, extraFlags });
  assert.deepEqual(refused.map(({ flag }) => flag), extraFlags.map((arg) => arg.split("=")[0]));
  assert.ok(refused.at(-1)?.reason.match(/unknown/i));
  assert.equal(JSON.stringify(refused).includes("fixture-value"), false);
});

test("only the exact single companion extension path may be used", () => {
  for (const flag of ["--load-extension", "--disable-extensions-except"]) {
    const extra = `${flag}=${companionExtensionPath}`;
    const plan = buildLaunchPlan({ ...pc, companionExtensionPath, extraFlags: [extra] });
    assert.ok(plan.ok);
    assert.ok(plan.args.includes(extra));
    assert.equal(refusal({ ...pc, extraFlags: [extra] })[0].flag, flag);

    for (const path of [`${companionExtensionPath}/`, "", `${companionExtensionPath},/tmp/other`]) {
      assert.equal(refusal({ ...pc, companionExtensionPath, extraFlags: [`${flag}=${path}`] })[0].flag, flag);
    }
  }
  const multiplePaths = "/tmp/companion,/tmp/other";
  assert.equal(refusal({ ...pc, companionExtensionPath: multiplePaths, extraFlags: [`--load-extension=${multiplePaths}`] })[0].flag,
    "--load-extension");
});

test("the debug port must be an integer from 1024 through 65535", () => {
  for (const debuggingPort of [1024, 65535]) {
    const plan = buildLaunchPlan({ ...pc, debuggingPort });
    assert.ok(plan.ok);
    assert.ok(plan.args.includes(`--remote-debugging-port=${debuggingPort}`));
  }
  for (const debuggingPort of [0, 1023, 65536, 9222.5, NaN, Infinity, "9222", undefined]) {
    assert.equal(refusal({ ...pc, debuggingPort })[0].flag, "--remote-debugging-port");
  }
});

test("invalid profile folders are refused by flag name", () => {
  for (const profileDir of ["", "profiles/work", "/tmp/work\0other", "/tmp/work\n", null]) {
    assert.equal(refusal({ ...pc, profileDir })[0].flag, "--user-data-dir");
  }
});

test("buildLaunchPlan accepts explicit safe extras without mutating input", () => {
  const extraFlags = Object.freeze(["--no-first-run", "--no-default-browser-check"]);
  const input = Object.freeze({ ...pc, extraFlags });
  const plan = buildLaunchPlan(input);
  assert.ok(plan.ok);
  assert.deepEqual(plan.args.slice(-2), extraFlags);
  assert.deepEqual(buildLaunchPlan(input), plan);
});

test("malformed input returns a refusal without throwing", () => {
  for (const input of [
    null, undefined, 0, [], Symbol(), {},
    { ...pc, location: "cloud" },
    { ...pc, headless: "false" },
    { ...pc, extraFlags: "--disable-web-security" },
    { ...pc, extraFlags: [null, {}, 42, "--", "/tmp/positional"] },
    { ...vps, extraFlags: ["--no-sandbox=unexpected"] },
    { ...pc, get extraFlags() { throw new Error("unreadable fixture"); } },
  ]) {
    assert.ok(refusal(input).length > 0);
  }
});
