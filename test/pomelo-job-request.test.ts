import assert from "node:assert/strict";
import test from "node:test";
import {
  checkJobRequest, JOB_REQUEST_GOAL_LIMIT, JOB_REQUEST_ID_LIMIT, JOB_REQUEST_SITE_LIMIT,
} from "../src/pomelo/browser/job-request.js";

const canary = "CANARY-JOBREQ-91c2";
const hide = (text: string) => ({ text: text.replaceAll(canary, "[hidden]"), hidden: text.split(canary).length - 1 });
const request = {
  threadId: "thread-1",
  laneId: "lane-2",
  profileId: "profile_3",
  goal: "Read the cart.",
  sites: ["https://shop.example"],
};
const brokerReason = "a secret must be filled by reference through the 1Password broker";

function reasons(input: unknown): string[] {
  const result = checkJobRequest(input, hide);
  assert.ok(!result.ok);
  return result.reasons;
}

test("cleans a copy and keeps exact origins in the order they first appear", () => {
  const sites = Object.freeze([
    "HTTPS://Shop.Example/cart?x=1",
    "help.test/article#top",
    "https://shop.example:443/checkout",
    "https://SHOP.EXAMPLE:8443/cart",
  ]);
  const input = Object.freeze({ ...request, goal: "  Read the cart.  ", sites, extra: { mode: "sample" } });
  const before = JSON.stringify(input);
  const result = checkJobRequest(input, hide);
  assert.deepEqual(result, {
    ok: true,
    request: { ...request, sites: ["https://shop.example", "https://help.test", "https://shop.example:8443"] },
  });
  assert.equal(JSON.stringify(input), before);
  assert.ok(result.ok);
  assert.notEqual(result.request.sites, sites);
});

test("the lane ID is optional and the site limit counts entries before merging", () => {
  const input = { ...request, laneId: undefined, sites: Array(JOB_REQUEST_SITE_LIMIT).fill(request.sites[0]) };
  assert.deepEqual(checkJobRequest(input, hide), {
    ok: true,
    request: { threadId: request.threadId, profileId: request.profileId, goal: request.goal, sites: request.sites },
  });
});

test("empty goals and missing, empty or oversized site lists each give a plain reason", () => {
  for (const goal of ["", " \t\n ", "\u0000\u200B\u202E"]) {
    assert.deepEqual(reasons({ ...request, goal }), ["Enter a browser job goal."]);
  }
  assert.deepEqual(reasons({ ...request, sites: undefined }), ["Provide a list of sites."]);
  assert.deepEqual(reasons({ ...request, sites: [] }), ["Provide at least one site."]);
  assert.deepEqual(reasons({ ...request, sites: Array(JOB_REQUEST_SITE_LIMIT + 1).fill(request.sites[0]) }), [
    `Provide at most ${JOB_REQUEST_SITE_LIMIT} sites.`,
  ]);
});

test("refuses wildcard patterns, non-HTTPS URLs, IPs, localhost and malformed sites", () => {
  for (const site of [
    "*.example", "<all_urls>", "https://shop.example/*", "http://shop.example",
    "https://127.0.0.1", "https://0x7f000001", "https://[::1]", "https://localhost",
    "https://service.localhost.", "file:///etc", "not a url", "https://[invalid", 42,
  ]) {
    assert.ok(reasons({ ...request, sites: [site] }).length);
  }
  assert.deepEqual(reasons({ ...request, sites: ["http://shop.example:8080/cart?q=sample"] }), [
    "Use HTTPS for shop.example.",
  ]);
  assert.deepEqual(reasons({ ...request, sites: Array(1) }), ["Enter a valid site address."]);
});

test("refuses URL user info and names only the host", () => {
  for (const site of ["https://sample-name:sample-value@shop.example/path", "https://sample-name@shop.example"]) {
    assert.deepEqual(reasons({ ...request, sites: [site] }), ["Remove user info from the address for shop.example."]);
  }
});

test("keeps Hebrew vowel marks and mixed text while removing controls", () => {
  for (const goal of ["בִּדְקוּ אֶת הָעֲגָלָה", "בִּדְקוּ את ה-cart 🛒"]) {
    const raw = ` \u0000${goal}\u007F\u061C\u200E\u200F\u202E\u2066\u2069\u200B `;
    assert.deepEqual(checkJobRequest({ ...request, goal: raw }, hide), { ok: true, request: { ...request, goal } });
  }
});

test("cuts goals only between whole characters, including Hebrew marks and emoji", () => {
  for (const character of ["שָׁ", "🛒", "👩‍💻"]) {
    const fits = "א".repeat(JOB_REQUEST_GOAL_LIMIT - character.length) + character;
    const overflows = "a".repeat(JOB_REQUEST_GOAL_LIMIT - 1);
    for (const [goal, expected] of [[fits + "ה", fits], [overflows + character, overflows]]) {
      assert.deepEqual(checkJobRequest({ ...request, goal }, hide), {
        ok: true, request: { ...request, goal: expected },
      });
    }
  }
});

test("refuses unsafe IDs without echoing them", () => {
  for (const [field, value] of [
    ["profileId", "../x"], ["laneId", "lane\n"], ["threadId", ""], ["threadId", "a".repeat(JOB_REQUEST_ID_LIMIT + 1)],
  ]) {
    assert.deepEqual(reasons({ ...request, [field]: value }), [`Provide a valid ${field}.`]);
  }
});

test("secret field names are refused anywhere, including in arrays and unknown fields", () => {
  for (const name of ["password", "secret", "TOKEN", "otp", "cookie"]) {
    assert.deepEqual(reasons({ ...request, extra: [{ nested: { [name]: "sample" } }] }), [brokerReason]);
  }
  assert.deepEqual(reasons({ ...request, password: "op://fixture-vault/fixture-item/fixture-field" }), [brokerReason]);
});

test("unknown fields and site paths with vault references are dropped and retained text is masked", () => {
  const ref = "op://fixture-vault/fixture-item/fixture-field";
  const input = {
    ...request, goal: `Read ${ref} and "op://fixture vault/fixture item/fixture field".`,
    sites: [`https://shop.example/${ref}?ref=${ref}`], extra: { reference: ref },
  };
  assert.deepEqual(checkJobRequest(input, hide), {
    ok: true, request: { ...request, goal: 'Read [secret hidden] and "[secret hidden]".' },
  });
  const maskedId = checkJobRequest({ ...request, threadId: ref, profileId: canary }, hide);
  assert.ok(maskedId.ok);
  assert.doesNotMatch(JSON.stringify(maskedId), /op:\/\/|CANARY-JOBREQ-91c2/);
  assert.deepEqual(checkJobRequest({ ...request, goal: "Read op://fixture vault/fixture item/field first." }, hide), {
    ok: true, request: { ...request, goal: "Read [secret hidden] first." },
  });
});

test("non-object inputs return a plain refusal", () => {
  for (const input of [null, "sample", []]) {
    assert.deepEqual(reasons(input), ["Provide a browser job request object."]);
  }
});

test("the job request canary never appears in a cleaned request or refusal", () => {
  const inputs = [
    { ...request, goal: `Read ${canary} first.` },
    { ...request, password: canary },
    { ...request, sites: [`https://shop.example/cart?q=${canary}`] },
    { ...request, sites: [`https://${canary}@shop.example/cart`] },
    { ...request, sites: [`http://${canary}.example/cart`] },
    { ...request, sites: [`https://${canary}.example/cart`] },
  ];
  const results = inputs.map((input) => checkJobRequest(input, hide));
  assert.deepEqual(results.map((result) => result.ok), [true, false, true, false, false, true]);
  for (const result of results) {
    assert.equal(JSON.stringify(result).toLowerCase().includes(canary.toLowerCase()), false);
  }
  assert.deepEqual(results[0], { ok: true, request: { ...request, goal: "Read [hidden] first." } });

  const padding = "a".repeat(JOB_REQUEST_GOAL_LIMIT - " [hidden]".length);
  const obscured = canary.replace("-", "-\u200B");
  assert.deepEqual(checkJobRequest({ ...request, goal: `${padding} ${obscured} first.` }, hide), {
    ok: true, request: { ...request, goal: `${padding} [hidden]` },
  });
});
