import assert from "node:assert/strict";
import test from "node:test";
import { paidToolGate, REQUIRED_PAID_TOOLS } from "../src/pomelo/paid-tools.js";

const toolsOff = ["coderabbit", "cursor-bugbot", "vercel-agent", "copilot"].map((name) => ({ name, state: "off" }));

test("the four required tools can all be switched off", () => {
  assert.deepEqual(REQUIRED_PAID_TOOLS, toolsOff.map(({ name }) => name));
  assert.deepEqual(paidToolGate(toolsOff), { ok: true, blocked: [] });
});

test("on is uncapped even when a cap is supplied", () => {
  const tools = [{ name: "coderabbit", state: "on", cap: 1 }, ...toolsOff.slice(1)];

  assert.deepEqual(paidToolGate(tools), {
    ok: false,
    blocked: [{ name: "coderabbit", reason: "uncapped" }],
  });
});

test("capped tools need a finite positive number", () => {
  const [tool, ...others] = toolsOff;
  const capped = { ...tool, state: "capped" };
  const badCap = { ok: false, blocked: [{ name: "coderabbit", reason: "bad-cap" }] };

  for (const cap of [0, -1, NaN, Infinity, -Infinity, "1", null]) {
    assert.deepEqual(paidToolGate([{ ...capped, cap }, ...others]), badCap);
  }
  assert.deepEqual(paidToolGate([capped, ...others]), badCap);
  assert.deepEqual(paidToolGate([{ ...capped, cap: 0.5 }, ...others]), { ok: true, blocked: [] });
});

test("a missing required tool blocks the run", () => {
  assert.deepEqual(paidToolGate(toolsOff.slice(1)), {
    ok: false,
    blocked: [{ name: "coderabbit", reason: "missing" }],
  });
});

test("custom required names compare case-insensitively after trimming both lists", () => {
  const tools = [{ name: "  Custom Tool ", state: "off" }];

  assert.deepEqual(paidToolGate(tools, [" custom tool  "]), { ok: true, blocked: [] });
});

test("an extra tool can block the run and the report contains only its name and reason", () => {
  const extra = { name: "extra-tool", state: "on", cap: 2, note: "fixture" };

  assert.deepEqual(paidToolGate([...toolsOff, extra]), {
    ok: false,
    blocked: [{ name: "extra-tool", reason: "uncapped" }],
  });
});

test("every duplicate entry has to pass regardless of order", () => {
  const badDuplicate = { name: " CodeRabbit ", state: "on" };
  const blocked = { ok: false, blocked: [{ name: badDuplicate.name, reason: "uncapped" }] };

  assert.deepEqual(paidToolGate([...toolsOff, badDuplicate]), blocked);
  assert.deepEqual(paidToolGate([badDuplicate, ...toolsOff]), blocked);
  assert.deepEqual(paidToolGate([...toolsOff, { ...badDuplicate, state: "capped", cap: 1 }]), {
    ok: true,
    blocked: [],
  });
});

test("unknown states block even when the required name is present", () => {
  const [, ...others] = toolsOff;

  assert.deepEqual(paidToolGate([{ name: "coderabbit", state: "paused" }, ...others]), {
    ok: false,
    blocked: [{ name: "coderabbit", reason: "unknown-state" }],
  });
});

test("malformed entries block without throwing or echoing their values", () => {
  for (const item of [null, undefined, false, 2, "off", [], { state: "off" }, { name: " ", state: "off" }]) {
    assert.deepEqual(paidToolGate([...toolsOff, item]), {
      ok: false,
      blocked: [{ name: "(unknown)", reason: "unknown-state" }],
    });
  }
});
