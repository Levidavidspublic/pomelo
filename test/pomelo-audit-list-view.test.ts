import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { auditList } from "../src/client/pomelo/audit-list.js";
import { PomeloAuditList } from "../src/client/pomelo/PomeloAuditList.js";
import type { AuditEvent } from "../src/pomelo/audit.js";
import { assertNoCanary, canaryForms } from "../src/pomelo/canary-sweep.js";

const fill = {
  at: 1_800_000_000_000,
  kind: "fill",
  actor: "fixture-worker",
  outcome: "ok",
  origin: "https://example.test",
  refId: "op://Demo/Login/FixtureField",
  jobId: "job-1",
} satisfies AuditEvent;

function render(list: ReturnType<typeof auditList>) {
  const formatTime = mock.fn((_at: number) => "Fixture time");
  const onMore = mock.fn();
  const html = renderToStaticMarkup(createElement(PomeloAuditList, { list, formatTime, onMore }));
  assert.equal(onMore.mock.callCount(), 0);
  return { html, formatTime };
}

function rowMarkup(html: string) {
  return Array.from(html.matchAll(/<li\b[^>]*>.*?<\/li>/g), ([row]) => row);
}

function rowText(row: string) {
  return row.replace(/<[^>]*>/g, "");
}

test("the audit list shows all five actions in the model's newest-first order", () => {
  const { html, formatTime } = render(auditList([
    fill,
    { ...fill, kind: "grant", at: fill.at + 2, refId: undefined, jobId: undefined },
    { ...fill, kind: "approval", at: fill.at + 4, origin: undefined, refId: undefined, jobId: undefined },
    { ...fill, kind: "revoke", at: fill.at + 3, refId: undefined, jobId: undefined },
    { ...fill, kind: "import", at: fill.at + 1, refId: undefined, jobId: undefined },
  ]));

  assert.match(html, /<ol\b/);
  const rows = rowMarkup(html);
  assert.deepEqual(rows.map(rowText), [
    "Request approved Fixture time",
    "Fill permission revoked https://example.test Fixture time",
    "Allowed fills on this site https://example.test Fixture time",
    "Imported cookies from Chrome https://example.test Fixture time",
    "Filled a saved login https://example.test Demo / Login job-1 Fixture time",
  ]);
  for (const row of rows) assert.match(row, /<time\b[^>]*\bdateTime="[^"]+">Fixture time<\/time>/i);
  assert.deepEqual(formatTime.mock.calls.map(({ arguments: args }) => args), [
    [fill.at + 4], [fill.at + 3], [fill.at + 2], [fill.at + 1], [fill.at],
  ]);
});

test("a refused fill is described as refused", () => {
  const { html } = render(auditList([{ ...fill, outcome: "refused" }]));
  assert.match(html, /Login fill refused/);
  assert.doesNotMatch(html, /Filled a saved login/);
});

test("an empty audit list shows its empty line without rows or a show more button", () => {
  for (const list of [auditList([]), auditList([fill], { kind: "approval" })]) {
    const { html, formatTime } = render(list);
    assert.ok(list.empty && html.includes(list.empty));
    assert.doesNotMatch(html, /<(?:ol|ul|li|button)\b/);
    assert.equal(formatTime.mock.callCount(), 0);
  }
});

test("only a page with more entries shows a show more button", () => {
  const events = [fill, { ...fill, at: fill.at + 1, kind: "import" }];
  const firstPage = render(auditList(events, { pageSize: 1 })).html;
  assert.equal(rowMarkup(firstPage).length, 1);
  assert.equal(Array.from(firstPage.matchAll(/<button\b/g)).length, 1);
  assert.match(firstPage, /<button\b[^>]*\btype="button"[^>]*>Show more<\/button>/);
  assert.doesNotMatch(render(auditList(events, { pageSize: 2 })).html, /<button\b/);
});

test("an entry without a timestamp shows time unknown without calling the formatter", () => {
  const { html, formatTime } = render(auditList([{ ...fill, at: undefined }]));
  assert.deepEqual(rowMarkup(html).map(rowText), ["Unreadable entry time unknown"]);
  assert.equal(formatTime.mock.callCount(), 0);
});

test("a Hebrew login label stays whole in a right-to-left row", () => {
  const refId = "op://כספת/כניסה%20לדוגמה/שדה";
  const { html } = render(auditList([{ ...fill, refId }]));
  assert.match(html, /<li\b[^>]*\bdir="rtl"[^>]*>.*כספת \/ כניסה לדוגמה/);
});

test("audit markup contains no canary, cookie value or full reference path", () => {
  // The same synthetic value used by the audit model's canary sweep.
  const canary = "synthetic-canary-value-42+fixture";
  const variants = new Set([
    ...canaryForms(canary).map(({ needle }) => needle),
    Buffer.from(canary).toString("base64"),
    Buffer.from(canary).toString("base64url"),
  ]);
  const kinds = ["fill", "import", "grant", "revoke", "approval"] as const;
  const events = Array.from(variants).flatMap((value) => [
    ...kinds.map((kind) => ({
      ...fill,
      kind,
      actor: value,
      threadId: value,
      jobId: value,
      refId: `op://Demo/Login/${value}`,
      grantId: value,
      origin: `https://example.test/?sample=${value}`,
      note: value,
      cookie: `sid=${value}`,
      value,
      extra: { nested: value },
    })),
    { ...fill, refId: `op://Demo/${value}/Field`, origin: `https://${value}.example.test` },
  ]);
  const { html } = render(auditList(events, { pageSize: events.length }));
  assertNoCanary(canary, { markup: html });
  assert.doesNotMatch(html, /op:\/\/|sid=/i);
  assert.equal(rowMarkup(html).length, events.length);
});
