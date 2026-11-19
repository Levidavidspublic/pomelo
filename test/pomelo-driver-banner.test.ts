import assert from "node:assert/strict";
import test from "node:test";
import { driverBanner } from "../src/client/pomelo/driver-banner.js";
import type { LocalTool } from "../src/client/local.js";

type ToolRow = Pick<LocalTool, "tool" | "name" | "path" | "loggedIn">;

const claude: ToolRow = { tool: "claude", name: "Claude", path: "/bin/claude", loggedIn: false };
const codex: ToolRow = { tool: "codex", name: "Codex", path: "/bin/codex", loggedIn: false };
const opencode: ToolRow = { tool: "opencode", name: "OpenCode", path: "/bin/opencode", loggedIn: false };
const cursor: ToolRow = { tool: "cursor", name: "Cursor", path: "/bin/cursor", loggedIn: false };

test("an installed tool that is signed in or has unknown status suppresses the banner", () => {
  assert.equal(driverBanner([claude, { ...codex, loggedIn: true }]), null);
  assert.equal(driverBanner([claude, { ...codex, loggedIn: null }]), null);
  assert.equal(driverBanner([claude, { ...cursor, loggedIn: true }]), null);
});

test("the sign-in banner names installed drivers in product order and opens Settings", () => {
  const rows = Object.freeze([opencode, cursor, codex, claude]);
  assert.deepEqual(driverBanner(rows), {
    text: "Sign in to Claude Code / Codex on this machine",
    tools: ["Claude Code", "Codex", "OpenCode"],
    action: { kind: "settings" },
  });
  assert.deepEqual(
    driverBanner([opencode, { ...claude, path: null, loggedIn: true }, opencode])?.tools,
    ["OpenCode"],
  );
});

test("with no installed tools, the banner asks the user to install one", () => {
  const expected = {
    text: "Install Claude Code, Codex, or OpenCode on this machine",
    tools: [],
    action: { kind: "settings" },
  };
  assert.deepEqual(driverBanner([]), expected);
  assert.deepEqual(driverBanner([{ ...claude, path: null, loggedIn: null }, { ...codex, path: null }]), expected);
});

test("banner results are frozen and contain only local guidance across tool states", () => {
  const rows = [claude, codex, opencode, cursor];
  const states = [
    { path: null, loggedIn: null },
    { path: "/bin/example", loggedIn: false },
    { path: "/bin/example", loggedIn: null },
    { path: "/bin/example", loggedIn: true },
  ];
  const combinations = rows.reduce<ToolRow[][]>(
    (combinations, row) => combinations.flatMap((tools) => states.map((state) => [
      ...tools, { ...row, ...state, name: "https://example.invalid" },
    ])),
    [[]],
  );

  for (const tools of combinations) {
    const banner = driverBanner(tools);
    if (banner === null) continue;
    assert.ok(["settings", "command"].includes(banner.action.kind));
    const json = JSON.stringify(banner);
    assert.doesNotMatch(json, /[a-z][a-z\d+.-]*:\/\/|www\.|claude\.ai/i);
    assert.doesNotMatch(json, /"[^"]*(?:password|email|token)[^"]*"\s*:/i);
    assert.ok(Object.isFrozen(banner));
    assert.ok(Object.isFrozen(banner.tools));
    assert.ok(Object.isFrozen(banner.action));
  }
});
