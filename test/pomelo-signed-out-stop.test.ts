import assert from "node:assert/strict";
import test from "node:test";
import { MASK } from "../src/pomelo/mask.js";
import {
  signedOutStop,
  type SignedOutContext,
  type SignedOutPageRead,
  type SignedOutStopResult,
} from "../src/pomelo/browser/signed-out-stop.js";

const canary = "fixture-only-marker-1846";
const query = "fixture_query=sample-503";
const origin = "https://example.invalid";
const page = Object.freeze({
  title: "Workspace dashboard",
  url: `${origin}/workspace?${query}`,
  text: `Recent projects\n${canary}`,
  items: Object.freeze([]),
  fields: Object.freeze([]),
}) satisfies SignedOutPageRead;
const context = Object.freeze({
  jobOrigins: Object.freeze([origin]),
  previousStepSignedIn: true,
  matchingReferenceCount: 1,
}) satisfies SignedOutContext;
const password = Object.freeze({ type: "password", name: "password", value: MASK });
const signIn = Object.freeze({
  ...page,
  title: "Sign in",
  text: `Account access\n${canary}`,
  fields: Object.freeze([password]),
});

function check(read: unknown, job: unknown, expected: SignedOutStopResult, extraMarkers: readonly string[] = []) {
  const result = signedOutStop(read, job);
  const serialized = JSON.stringify(result);
  const snapshot = read as Partial<SignedOutPageRead> | null | undefined;
  const fieldMarkers = snapshot?.fields?.flatMap((field) => field ? [field.name, field.label, field.value] : []) ?? [];
  const markers = [
    canary, query, origin, MASK, snapshot?.title,
    ...(typeof snapshot?.text === "string" ? snapshot.text.split("\n") : []),
    ...(Array.isArray(snapshot?.items) ? snapshot.items : []), ...fieldMarkers, ...extraMarkers,
  ];
  for (const marker of markers) {
    if (typeof marker === "string" && marker.length > 0) {
      assert.ok(!serialized.includes(marker), "a decision must omit fixture data");
    }
  }
  assert.deepEqual(result, expected);
}

test("continues on a normal signed-in page and an article about login with a search box", () => {
  const go = { state: "go", reason: "no_sign_in" } as const;
  check(page, context, go);
  check({
    ...page,
    text: `An article about login troubleshooting.\n${canary}`,
    url: `${origin}/guides/login-troubleshooting?${query}&next=/signin`,
    fields: [{ type: "search", name: "article-search", value: MASK }],
  }, context, go, ["article-search"]);
});

test("waits for the broker when a masked password appears with an English or Hebrew sign-in prompt", () => {
  const hold = { state: "hold_for_broker", reason: "sign_in_form" } as const;
  check(signIn, context, hold);
  check({ ...signIn, title: "גישה לאתר", text: `התחברות לחשבון\n${canary}` }, context, hold);
  check({
    ...page,
    items: [`[1] field:password "${MASK}"`, '[2] button "Log in"'],
  }, context, hold);
  check({
    ...signIn,
    fields: [{ type: "text", autocomplete: "current-password", value: MASK }],
  }, context, hold);
  check({
    ...signIn,
    text: `${signIn.text}\nSign up`,
    items: ['[1] link "Sign up"'],
  }, context, hold);
});

test("reads an items-only desktop sign-in form off the login path", () => {
  const passwordItem = '[3] field:password "Password"';
  const desktopRead = {
    title: page.title,
    url: page.url,
    text: page.text,
    cut: false,
    items: [passwordItem, '[4] button "Log in"'],
  } satisfies SignedOutPageRead;
  const hold = { state: "hold_for_broker", reason: "sign_in_form" } as const;
  check(desktopRead, context, hold, ["Password", "Log in"]);
  check({
    ...desktopRead,
    items: [passwordItem, '[4] field:submit "Log in" = Log in'],
  }, context, hold, ["Password", "Log in"]);
  check({
    ...desktopRead,
    text: `${desktopRead.text}\nSign up`,
    items: [...desktopRead.items, `[5] link "Sign up" → ${origin}/signup?${query}`],
  }, context, hold, ["Password", "Log in"]);
  check({
    ...desktopRead,
    items: [passwordItem, '[4] field:submit "Continue" = Log in'],
  }, context, { state: "go", reason: "no_sign_in" }, ["Password", "Continue", "Log in"]);
});

test("waits when the session ended even without a password field", () => {
  const hold = { state: "hold_for_broker", reason: "session_ended" } as const;
  check({ ...page, text: `Your session has expired. Please reload.\n${canary}` }, context, hold);
  check({ ...page, title: "You have been signed out" }, context, hold);
  check({ ...page, text: `פג תוקף ההתחברות.\n${canary}` }, context, hold);
});

test("uses a login path only after a signed-in step", () => {
  const hold = { state: "hold_for_broker", reason: "sign_in_path" } as const;
  for (const path of ["/login", "/signin", "/account/sign-in/"]) {
    const redirected = { ...page, url: `${origin}${path}?${query}` };
    check(redirected, context, hold);
    check(redirected, { ...context, previousStepSignedIn: false }, { state: "go", reason: "no_sign_in" });
  }
});

test("requires exactly one fitting reference and an exact origin in the job scope", () => {
  const hold = { state: "hold_for_amit", reason: "sign_in_form" } as const;
  check(signIn, { ...context, matchingReferenceCount: 0 }, hold);
  check(signIn, { ...context, matchingReferenceCount: 2 }, hold);
  check(signIn, { ...context, jobOrigins: [] }, hold);
  for (const jobOrigin of ["https://other.invalid", "https://accounts.example.invalid", "https://example.invalid:8443", "http://example.invalid"]) {
    check(signIn, { ...context, jobOrigins: [jobOrigin] }, hold, [jobOrigin]);
  }
  check(signIn, { ...context, jobOrigins: ["https://EXAMPLE.invalid:443/"] }, {
    state: "hold_for_broker", reason: "sign_in_form",
  });
});

test("holds sign-up and password changes for Amit even when a login cue is present", () => {
  const hold = { state: "hold_for_amit", reason: "account_form" } as const;
  check({ ...signIn, title: "Create an account", url: `${origin}/login?${query}` }, context, hold);
  check({ ...signIn, title: "Change your password" }, context, hold);
  check({ ...signIn, items: ['[1] button "הרשמה"'] }, context, hold);
  check({
    ...signIn,
    fields: [password, { ...password, autocomplete: "section-account new-password" }],
  }, context, hold);
  check({
    ...page,
    url: `${origin}/account/change-password?${query}`,
    fields: [password],
  }, context, hold);
});

test("holds when either snapshot format shows multiple password fields", () => {
  const passwordItem = '[1] field:password "Password"';
  const hold = { state: "hold_for_amit", reason: "account_form" } as const;
  check({
    ...page,
    fields: [password, password],
  }, context, hold);
  check({
    title: page.title,
    url: page.url,
    text: page.text,
    items: [passwordItem, '[2] field:password ""', '[3] button "Continue"'],
  }, context, hold, ["Password", "Continue"]);
  check({ ...signIn, items: [passwordItem] }, context, {
    state: "hold_for_broker", reason: "sign_in_form",
  }, ["Password"]);
});

test("returns a fixed hold for missing or malformed inputs and unmasked password data", () => {
  const hold = { state: "hold_for_amit", reason: "bad_input" } as const;
  check(undefined, undefined, hold);
  check({}, context, hold);
  check({ ...page, title: "", text: "" }, context, hold);
  check(page, {}, hold);
  check({ ...page, url: `not a URL?${query}` }, context, hold);
  check({ ...page, url: `file:///login?${query}` }, context, hold);
  check({ ...page, cut: "no" }, context, hold);
  check({ ...page, items: [null] }, context, hold);
  check({ ...page, fields: [null] }, context, hold);
  check({ ...signIn, fields: [{ ...password, value: canary }] }, context, hold);
  check(signIn, { ...context, matchingReferenceCount: -1 }, hold);
  check(signIn, { ...context, jobOrigins: ["https://*.example.invalid"] }, hold);
  assert.deepEqual(signedOutStop(new Proxy(page, {
    get() { throw new Error(canary); },
  }), context), hold);
});
