import assert from "node:assert/strict";
import test from "node:test";
import { siteDownStop } from "../src/pomelo/browser/site-down-stop.js";

const normal = {
  status: 200,
  title: "Account",
  maskedText: "Welcome to your account.",
  triesSoFar: 1,
  lastStepKind: "read",
};
const outage = { ...normal, status: 503, maskedText: "Temporarily unavailable. Please check back later." };

for (const status of [500, 502, 503, 504, 599]) {
  test(`HTTP ${status} permits three waits with increasing delays and then holds`, () => {
    const page = { ...outage, status, maskedText: status === 503 ? outage.maskedText : normal.maskedText };
    let previousDelay = 0;
    for (const triesSoFar of [1, 2, 3]) {
      const result = siteDownStop({ ...page, triesSoFar });
      assert.equal(result.verdict, "wait");
      assert.ok(result.waitSeconds > previousDelay);
      previousDelay = result.waitSeconds;
    }

    for (const triesSoFar of [4, 5]) {
      const result = siteDownStop({ ...page, triesSoFar });
      assert.equal(result.verdict, "hold");
      assert.equal(result.waitSeconds, 0);
      assert.match(result.reason, /amit/i);
    }
  });
}

test("a custom retry limit can shorten or disable automatic retries", () => {
  assert.equal(siteDownStop({ ...outage, maxTries: 1 }).verdict, "wait");
  assert.equal(siteDownStop({ ...outage, maxTries: 1, triesSoFar: 2 }).verdict, "hold");
  assert.equal(siteDownStop({ ...outage, maxTries: 0 }).verdict, "hold");
});

test("recognizes outage wording in a successful response's title or masked text", () => {
  for (const page of [
    { ...normal, title: "Down for maintenance" },
    { ...normal, title: "האתר בתחזוקה", maskedText: "" },
    { ...normal, title: "503 Service Unavailable | Example" },
    { ...normal, maskedText: "Example site\nInternal server error\nPlease check back later." },
    { ...normal, maskedText: "Temporarily unavailable. Please check back later." },
    { ...normal, maskedText: "This site is temporarily unavailable. Please check back later." },
    { ...normal, maskedText: "Sorry, we’re down for scheduled maintenance." },
  ]) {
    assert.equal(siteDownStop(page).verdict, "wait");
    assert.equal(siteDownStop({ ...page, triesSoFar: 4 }).verdict, "hold");
  }
});

test("ordinary pages can mention maintenance or quote error wording", () => {
  for (const page of [
    { ...normal, title: "Maintenance guide", maskedText: "Regular maintenance keeps your site available." },
    { ...normal, title: "Server error troubleshooting", maskedText: "If you see ‘Down for maintenance’, check the site's status page." },
    { ...normal, maskedText: "Monthly page views\n500" },
    { ...normal, triesSoFar: 4 },
  ]) {
    const result = siteDownStop(page);
    assert.equal(result.verdict, "go");
    assert.equal(result.waitSeconds, 0);
  }
});

test("a troubleshooting article with an error phrase in its title can proceed", () => {
  assert.equal(siteDownStop({ ...normal, title: "Server error: how to fix it" }).verdict, "go");
});

test("a search result with a bare not-found line can proceed", () => {
  const maskedText = "Search results\nNot found.\nTry a different search.";
  assert.equal(siteDownStop({ ...normal, maskedText }).verdict, "go");
});

test("a not-found page holds without a retry", () => {
  for (const page of [
    { ...outage, status: 404, retryAfterSeconds: 30 },
    { ...normal, title: "404 Not Found" },
    { ...normal, maskedText: "Page not found." },
  ]) {
    assert.deepEqual(siteDownStop(page), { verdict: "hold", waitSeconds: 0, reason: "not-found" });
  }
});

test("uses a positive Retry-After hint and caps the wait at one minute", () => {
  assert.equal(siteDownStop({ ...outage, retryAfterSeconds: 17 }).waitSeconds, 17);
  assert.equal(siteDownStop({ ...outage, retryAfterSeconds: 3_600 }).waitSeconds, 60);
  const fallback = siteDownStop(outage).waitSeconds;
  for (const retryAfterSeconds of [-1, NaN, Infinity]) {
    assert.equal(siteDownStop({ ...outage, retryAfterSeconds }).waitSeconds, fallback);
  }
});

test("healthy pages can proceed after a fill or import", () => {
  for (const lastStepKind of ["fill", "import"]) {
    assert.equal(siteDownStop({ ...normal, lastStepKind }).verdict, "go");
  }
});

test("fill and import turn a retryable outage into an immediate hold", () => {
  for (const lastStepKind of ["fill", "import"]) {
    for (const page of [outage, { ...normal, title: "Down for maintenance" }]) {
      assert.deepEqual(siteDownStop({ ...page, lastStepKind }), {
        verdict: "hold", waitSeconds: 0, reason: "after-fill",
      });
    }
  }
});

test("fill and import preserve the reason for a page that already holds", () => {
  for (const lastStepKind of ["fill", "import"]) {
    for (const page of [{ ...normal, status: 404 }, { ...normal, maskedText: null }, { ...outage, triesSoFar: 4 }]) {
      assert.deepEqual(siteDownStop({ ...page, lastStepKind }), siteDownStop(page));
    }
  }
});

test("empty and unreadable reads hold without a retry", () => {
  for (const page of [
    { ...normal, title: "", maskedText: " \n\t" },
    { ...normal, maskedText: null },
    { ...normal, maskedText: "••••" },
    { ...outage, title: null, maskedText: null },
  ]) {
    const result = siteDownStop(page);
    assert.equal(result.verdict, "hold");
    assert.equal(result.waitSeconds, 0);
  }
});

test("invalid retry counts cannot schedule another attempt", () => {
  for (const count of [-1, 1.5, NaN, Infinity]) {
    assert.equal(siteDownStop({ ...outage, triesSoFar: count }).verdict, "hold");
    assert.equal(siteDownStop({ ...outage, maxTries: count }).verdict, "hold");
  }
});

test("results contain only the decision and never include the page canary", () => {
  const canary = "made-up-site-down-canary";
  const maskedText = `Please check back later.\n${canary}`;
  for (const page of [normal, outage, { ...outage, triesSoFar: 4 }]) {
    const facts = Object.freeze({ ...page, title: `Example ${canary}`, maskedText });
    const result = siteDownStop(facts);
    assert.deepEqual(result, siteDownStop(page));
    assert.deepEqual(Object.keys(result).sort(), ["reason", "verdict", "waitSeconds"]);
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});
