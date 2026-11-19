import assert from "node:assert/strict";
import test from "node:test";
import {
  skillPreflight,
  type BrowserSkillStep,
  type SkillPreflightInput,
  type SkillPreflightResult,
} from "../src/pomelo/browser/skill-preflight.js";

const origin = "https://a.example";
const text = "sample preflight text";
const ref = { id: "login", allowedOrigins: [origin] };
const fill = { kind: "fill", origin, refId: ref.id } as const;
const open = { kind: "open", origin } as const;
const now = 1_000;

function check(
  steps: readonly BrowserSkillStep[],
  expected: SkillPreflightResult,
  options: Partial<Pick<SkillPreflightInput, "refs" | "vaultStatus">> = {},
): void {
  const result = skillPreflight({
    skill: { name: "Sample browser skill", steps },
    refs: [ref],
    vaultStatus: "SET",
    now,
    ...options,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(text), false);
  assert.equal(serialized.includes("op://"), false);
  assert.deepEqual(result, expected);
}

test("a skill without fills can run with the vault locked or unset", () => {
  const steps = [open, { kind: "click", origin }, { kind: "type", origin, text },
    { kind: "press", origin }, { kind: "scroll", origin }] as const;
  check(steps, { state: "ready" }, { vaultStatus: "LOCKED" });
  check(steps, { state: "ready" }, { vaultStatus: "UNSET" });
});

test("a fill with an allowed reference can run", () => {
  check([fill], { state: "ready" });
});

test("a fill with text is refused even with a reference or with empty text", () => {
  const expected = { state: "refused", reason: "value_in_skill", step: 1 } as const;
  check([open, { ...fill, text }], expected);
  check([open, { ...fill, text: "" }], expected);
  check([open, { kind: "fill", origin, text: "op://fictional-vault/sample-item/sample-field" }], expected);
});

test("a fill waits if its reference ID is absent or unknown", () => {
  const expected = { state: "waiting", reason: "ref_missing", step: 1 } as const;
  check([open, { kind: "fill", origin }], expected);
  check([open, { ...fill, refId: "unknown" }], expected);
});

test("a fill waits at and after reference expiry", () => {
  const expected = { state: "waiting", reason: "ref_expired", step: 1 } as const;
  for (const expiresAt of [now - 1, now]) {
    check([open, fill], expected, { refs: [{ ...ref, expiresAt }] });
  }
  check([open, fill], { state: "ready" }, { refs: [{ ...ref, expiresAt: now + 1 }] });
});

test("a fill requires the exact scheme, host and port in the allowlist", () => {
  const expected = { state: "refused", reason: "origin_not_allowed", step: 1 } as const;
  for (const otherOrigin of ["https://a.example:8443", "http://a.example", "https://b.a.example"]) {
    check([open, { ...fill, origin: otherOrigin }], expected);
  }
  check([open, fill], expected, { refs: [{ ...ref, allowedOrigins: ["https://*.example"] }] });
  check([open, fill], { state: "ready" }, {
    refs: [{ ...ref, allowedOrigins: ["https://b.a.example", "https://A.example:443"] }],
  });
});

test("a fill waits for the vault at the index of the first fill", () => {
  const steps = [open, fill, fill];
  check(steps, { state: "waiting", reason: "vault_locked", step: 1 }, { vaultStatus: "LOCKED" });
  check(steps, { state: "waiting", reason: "vault_unset", step: 1 }, { vaultStatus: "UNSET" });
});

test("a step with a missing, unparsable or opaque origin or an unknown kind is refused", () => {
  const expected = { state: "refused", reason: "bad_step", step: 1 } as const;
  const malformed = [
    { kind: "click" },
    { kind: "click", origin: "a.example" },
    { kind: "click", origin: "about:blank" },
    { kind: "read", origin },
  ] as const;
  for (const step of malformed) {
    check([open, step as BrowserSkillStep], expected);
  }
});

test("a later refusal takes priority over an earlier expired reference", () => {
  check([open, fill, open, { ...fill, text }], { state: "refused", reason: "value_in_skill", step: 3 }, {
    refs: [{ ...ref, expiresAt: now - 1 }],
  });
});

test("a disallowed origin is refused even if the same reference is expired and the vault is locked", () => {
  check([{ ...fill, origin: "https://b.a.example" }], { state: "refused", reason: "origin_not_allowed", step: 0 }, {
    refs: [{ ...ref, expiresAt: now - 1 }],
    vaultStatus: "LOCKED",
  });
});

test("the earliest step wins among problems with the same state", () => {
  check([open, fill, { ...fill, refId: "unknown" }], { state: "waiting", reason: "vault_locked", step: 1 }, {
    vaultStatus: "LOCKED",
  });
  check([open, { ...fill, text }, { ...fill, origin: "https://b.a.example" }],
    { state: "refused", reason: "value_in_skill", step: 1 });
});
