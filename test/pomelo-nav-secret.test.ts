import assert from "node:assert/strict";
import test from "node:test";
import { addressSecretCheck } from "../src/pomelo/browser/nav-secret.js";
import { assertNoCanary, canaryForms } from "../src/pomelo/canary-sweep.js";
import { MASK } from "../src/pomelo/mask.js";

const address = "https://example.invalid/docs";
const canary = ["fixture", '7f"3\\a', "ÿÿÿ + 91c2e5"].join("-");
const known = Object.freeze({ knownSecrets: Object.freeze([canary]) });

function refused(input: string, options?: Parameters<typeof addressSecretCheck>[1]) {
  const result = addressSecretCheck(input, options);
  assert.equal(result.verdict, "refuse");
  assertNoCanary(canary, { result: JSON.stringify(result) });
  assert.ok(result.safeAddress.includes(MASK));
  return result;
}

test("an ordinary HTTPS address passes with a log-safe copy", () => {
  const ordinary = `${address}?page=2#details`;
  assert.deepEqual(addressSecretCheck(ordinary), { verdict: "go", problems: [], safeAddress: ordinary });
});

test("user-info is refused and omitted from the masked address", () => {
  const secret = encodeURIComponent(canary);
  const result = refused(`https://fixture:${secret}@example.invalid/docs`);
  assert.deepEqual(result.problems.map(({ part, key }) => [part, key]), [["user-info", null]]);
  assert.equal(result.safeAddress, `https://example.invalid/${MASK}`);
  refused(`https://${secret}@example.invalid/docs`);
  refused("https://user:pw@example.invalid/");
});

test("secret-like keys are refused case-insensitively in queries and fragments", () => {
  const keys = [
    "password", "passwd", "pwd", "token", "access_token", "id_token", "api_key", "apikey", "secret", "otp",
    "code", "key", "sig", "signature", "session",
  ];
  const secret = encodeURIComponent(canary);
  for (const [part, prefix] of [["query", "?"], ["fragment", "#"], ["fragment", "#/route?"]] as const) {
    for (const key of keys) {
      const result = refused(`${address}${prefix}${key.toUpperCase()}=${secret}`);
      assert.deepEqual(result.problems.map((problem) => [problem.part, problem.key]), [[part, key]]);
    }
  }
  refused(`${address}?%2574oken=${secret}`);
  refused(`${address}#%50WD`);
  refused(`${address}?token=${secret}&echo=${secret}`);
});

test("only an opted-in sign-in return can carry a code with state, and neither value is logged", () => {
  const secret = encodeURIComponent(canary);
  const callbackOptions = { allowSignInReturn: true };
  const state = "synthetic-state-fixture";
  for (const prefix of ["?", "#/return?"]) {
    const callback = `${address}${prefix}Code=${secret}&STATE=${state}`;
    refused(callback);
    const result = addressSecretCheck(callback, callbackOptions);
    assert.equal(result.verdict, "go");
    assert.deepEqual(result.problems, []);
    assert.ok(result.safeAddress.includes(MASK));
    assert.ok(!result.safeAddress.includes(state));
    assertNoCanary(canary, { result: JSON.stringify(result) });
    refused(callback, { ...callbackOptions, ...known });
  }
  for (const suffix of [
    `?code=${secret}`, `?code=${secret}&state=`, `?code=${secret}#state=${state}`,
    `?code=${secret}&CODE=fixture&state=${state}`, `?code=fixture&state=${state}&token=${secret}`,
  ]) {
    refused(`${address}${suffix}`, callbackOptions);
  }
});

test("known secrets are refused in path, query, fragment, user-info and parameter names", () => {
  const secret = encodeURIComponent(canary);
  for (const [input, part, key] of [
    [`${address}/${secret}`, "path", null],
    [`${address}?lookup=${secret}`, "query", "lookup"],
    [`${address}#/route?lookup=${secret}`, "fragment", "lookup"],
    [`https://${secret}@example.invalid/docs`, "user-info", null],
    [`${address}?${secret}=fixture`, "query", null],
  ] as const) {
    const result = refused(input, known);
    assert.deepEqual(result.problems.map((problem) => [problem.part, problem.key]), [[part, key]]);
  }
  refused(`${address}/${secret}/..`, known);
  refused(`${address}/a`, { knownSecrets: ["", "a"] });
  assert.equal(addressSecretCheck(address, { knownSecrets: [""] }).verdict, "go");
});

test("a detected value repeated in the host or a parameter name stays out of the result", () => {
  const fixture = "synthetic-echo-value";
  const result = refused(`https://${fixture}.invalid/?password=${fixture}&${fixture}=${encodeURIComponent(canary)}`, known);
  assert.equal(result.safeAddress, MASK);
  assert.deepEqual(result.problems.map(({ key }) => key), ["password", null]);
  assert.ok(!JSON.stringify(result).includes(fixture));
});

test("the entire refusal stays clear of plain and encoded canary forms", () => {
  const encoded = encodeURIComponent(canary);
  const hex = Buffer.from(canary).toString("hex");
  const forms = [
    ...canaryForms(canary).map(({ needle }) => needle),
    encodeURIComponent(encoded),
    encoded.replace(/%[\dA-F]{2}/g, (escape) => escape.toLowerCase()),
    hex.replace(/[a-f]/, (digit) => digit.toUpperCase()),
    Buffer.from(`x${canary}suffix`).toString("base64"),
  ];
  for (const form of forms) {
    for (const prefix of ["/", "?lookup=", "#"]) {
      const result = refused(`${address}${prefix}${form}`, known);
      assert.ok(!JSON.stringify(result).includes(form));
    }
  }
  const formEncoded = new URLSearchParams({ lookup: canary }).toString().slice("lookup=".length);
  refused(`${address}?lookup=${formEncoded}`, known);
  refused(`${address}?lookup=${encodeURIComponent(formEncoded)}`, known);
});

test("invalid addresses are refused without returning the input or the parser error", () => {
  const result = refused(`https://[bad/${canary}`, known);
  assert.deepEqual(result.problems, [{ part: "address", key: null, reason: "The address is invalid." }]);
  assert.equal(result.safeAddress, MASK);
});
