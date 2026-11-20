import assert from "node:assert/strict";
import test from "node:test";
import { e2eMockLines, isE2eFile, type AddedLine } from "../src/pomelo/e2e-mocks.js";

const path = "e2e/f1.spec.ts";

test("reports each added Playwright interception line without copying its source", () => {
  const lines = [
    { path, line: 4, text: "await page.route('**/api/sessions/mine', handler);" },
    { path, line: 5, text: "await context . route ('**/api/run', handler);" },
    { path, line: 7, text: "await route.fulfill({ json: { sample: 'fixture value' } });" },
    { path, line: 9, text: "await context.routeFromHAR('fixtures/run.har');" },
    { path, line: 11, text: "await route.abort();" },
    { path, line: 13, text: "await page.exposeFunction('example', handler);" },
  ];

  const findings = e2eMockLines(lines);
  assert.deepEqual(findings.map(({ path, line, kind }) => ({ path, line, kind })), [
    { path, line: 4, kind: "route" },
    { path, line: 5, kind: "route" },
    { path, line: 7, kind: "fulfill" },
    { path, line: 9, kind: "har" },
    { path, line: 11, kind: "abort" },
    { path, line: 13, kind: "expose-function" },
  ]);
  for (const [index, finding] of findings.entries()) {
    assert.deepEqual(Object.keys(finding).sort(), ["kind", "line", "path", "reason"]);
    assert.ok(finding.reason.trim());
    assert.ok(!JSON.stringify(finding).includes(lines[index].text));
  }
  assert.doesNotMatch(JSON.stringify(findings), /api\/sessions|api\/run|fixture value|fixtures\/run\.har/);
});

test("reports init scripts that replace fetch or EventSource", () => {
  const findings = e2eMockLines([
    { path, line: 2, text: "await page.addInitScript(() => { window.fetch = fakeFetch; });" },
    { path, line: 4, text: "await context.addInitScript(() => {" },
    { path, line: 5, text: "  globalThis.EventSource = FakeEventSource;" },
    { path, line: 6, text: "});" },
    { path, line: 8, text: "await page.addInitScript({ content: 'window.fetch = fakeFetch;' });" },
    { path, line: 10, text: "await page.addInitScript(() => { window.example = true; });" },
    { path, line: 11, text: "await page.addInitScript(() => { if (fetch === original) ready(); });" },
    { path, line: 12, text: "await page.addInitScript(() => { /* window.fetch = fakeFetch; */ });" },
    { path, line: 13, text: "globalThis.EventSource = OriginalEventSource;" },
    { path, line: 14, text: 'await page.addInitScript(() => Object.defineProperty(window, "fetch", { value: fakeFetch }));' },
    { path, line: 15, text: "await page.addInitScript(() => Object.assign(window, { EventSource: FakeEventSource }));" },
  ]);

  assert.deepEqual(findings.map(({ line, kind }) => ({ line, kind })), [
    { line: 2, kind: "init-script" },
    { line: 4, kind: "init-script" },
    { line: 8, kind: "init-script" },
    { line: 14, kind: "init-script" },
    { line: 15, kind: "init-script" },
  ]);
});

test("reports stubs of the three agent tools and allows assertions about real calls", () => {
  const findings = e2eMockLines([
    { path, line: 1, text: "stubTool('spawn_subagent', async () => fixture);" },
    { path, line: 2, text: "mockTool('open_thread', fixture);" },
    { path, line: 3, text: "tag_project: async () => fixture," },
    { path, line: 4, text: "expect(toolCalls).toContain('spawn_subagent');" },
    { path, line: 5, text: "await tools.open_thread(input);" },
    { path, line: 6, text: "mockTool('open_thread_extra', fixture);" },
    { path, line: 7, text: "expect(message).toContain('tag_project: async () => fixture');" },
    { path, line: 8, text: "'spawn_subagent': vi.fn().mockResolvedValue(fixture)," },
    { path, line: 9, text: "const stubTools = { open_thread: reply };" },
  ]);

  assert.deepEqual(findings.map(({ line, kind }) => ({ line, kind })), [
    { line: 1, kind: "tool-stub" },
    { line: 2, kind: "tool-stub" },
    { line: 3, kind: "tool-stub" },
    { line: 8, kind: "tool-stub" },
    { line: 9, kind: "tool-stub" },
  ]);
  ["spawn_subagent", "open_thread", "tag_project", "spawn_subagent", "open_thread"].forEach((tool, index) => {
    assert.ok(findings[index].reason.includes(tool));
  });
});

test("matches spec suffixes and exact e2e and playwright path segments", () => {
  for (const file of ["f1.spec.ts", "test/e2e/check.ts", "playwright/helpers.js", "suite\\playwright\\helper.ts"]) {
    assert.equal(isE2eFile(file), true, file);
    assert.equal(e2eMockLines([{ path: file, line: 1, text: "await page.route(pattern, handler);" }]).length, 1);
  }

  for (const file of ["src/pomelo/x.ts", "test/pomelo-x.test.ts", "my-e2e/check.ts", "playwright.ts", "x.spec.ts.bak"]) {
    assert.equal(isE2eFile(file), false, file);
    assert.deepEqual(e2eMockLines([{ path: file, line: 1, text: "await page.route(pattern, handler);" }]), []);
  }
});

test("ignores comments, real navigation and ordinary checks", () => {
  assert.deepEqual(e2eMockLines([
    { path, line: 1, text: "  // await page.route(pattern, handler);" },
    { path, line: 3, text: "  /* await route.abort(); */" },
    { path, line: 4, text: "  * stubTool('spawn_subagent', fixture);" },
    { path, line: 5, text: "await page.goto('/'); // await route.abort();" },
    { path, line: 6, text: "await page.getByRole('button').click();" },
    { path, line: 7, text: "expect(message).toContain('page.route(');" },
    { path, line: 8, text: "/*" },
    { path, line: 9, text: "routeFromHAR('fixtures/run.har');" },
    { path, line: 10, text: "*/" },
  ]), []);
});

test("ignores empty and malformed input", () => {
  for (const input of [undefined, null, {}, [], [
    undefined,
    { path, line: 1 },
    { path, line: "2", text: "page.route(" },
    { path, line: 0, text: "page.route(" },
    { path, line: 2.5, text: "page.route(" },
    { path: 1, line: 3, text: "page.route(" },
    { path, line: 4, text: 42 },
  ]]) {
    assert.deepEqual(e2eMockLines(input as AddedLine[]), []);
  }
});
