import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloWaitingJobs } from "../src/client/pomelo/PomeloWaitingJobs.js";
import { makeThreadLink } from "../src/client/pomelo/thread-link.js";
import { waitingJobs } from "../src/client/pomelo/waiting-jobs.js";

function render(jobs: unknown) {
  return renderToStaticMarkup(createElement(PomeloWaitingJobs, {
    summary: waitingJobs(jobs),
    onOpen: () => {},
  }));
}

test("the summary shows the count, plain reasons, and browser links for the waiting threads", () => {
  const html = render([
    { id: "vault", threadId: "thread-vault", state: "waiting", waitReason: "vault_locked" },
    { id: "cloud", threadId: "thread-cloud", state: "waiting", waitReason: "cloud_unreachable" },
    { id: "running", threadId: "thread-running", state: "running", waitReason: "approval" },
  ]);

  assert.match(html, /<h2\b[^>]*>2 browser jobs waiting for you<\/h2><ul\b/);
  const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  assert.equal(rows.length, 2);
  const expected = [
    { threadId: "thread-vault", label: "Unlock 1Password" },
    { threadId: "thread-cloud", label: "VPS not reachable" },
  ];
  expected.forEach(({ threadId, label }, index) => {
    const href = rows[index].match(/<a\b[^>]*\bhref="([^"]+)"/)?.[1];
    assert.equal(href?.replaceAll("&amp;", "&"), makeThreadLink({ threadId, panel: "browser" }));
    assert.ok(rows[index].includes(`>${label}<`));
  });
  assert.doesNotMatch(html, /vault[-_]locked|cloud_unreachable|vps-unreachable/);
});

test("no waiting jobs render nothing", () => {
  assert.equal(render([]), "");
  assert.equal(render([{ id: "done", threadId: "thread-done", state: "done" }]), "");
});

test("jobs sharing a reason and thread each get a row", () => {
  const html = render(["first", "second"].map((id) => ({
    id,
    threadId: "shared-thread",
    state: "waiting",
    waitReason: "budget",
  })));

  assert.equal([...html.matchAll(/<li\b/g)].length, 2);
  assert.equal([...html.matchAll(/>Review the job budget</g)].length, 2);
});

test("a waiting job with an invalid thread ID still shows its reason", () => {
  const html = render([
    { id: "invalid", threadId: "invalid/thread", state: "waiting", waitReason: "captcha" },
  ]);

  assert.match(html, /<h2\b[^>]*>1 browser job waiting for you<\/h2>/);
  assert.match(html, />Complete the CAPTCHA</);
  assert.doesNotMatch(html, /<a\b|invalid\/thread/);
});

test("raw job content never reaches the summary markup", () => {
  const canary = "fixture canary+/=";
  const encoded = encodeURIComponent(canary);
  const threadTitle = "תכנון הפרויקט";
  const html = render([{
    id: "sample",
    threadId: "thread-sample",
    state: "waiting",
    waitReason: "approval",
    steps: [{ text: canary }],
    pageText: canary,
    url: `https://example.invalid/?sample=${encoded}`,
    extra: canary,
    threadTitle,
  }]);

  assert.match(html, />Approval needed</);
  assert.match(html, /<a\b/);
  for (const excluded of [canary, encoded, Buffer.from(canary).toString("base64"), "example.invalid", threadTitle]) {
    assert.equal(html.includes(excluded), false);
  }
});
