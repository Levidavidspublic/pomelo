import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PanelJob, PanelProfile } from "../src/client/pomelo/browser-panel.js";
import { PomeloBrowserJobs } from "../src/client/pomelo/PomeloBrowserJobs.js";

const local = { id: "local", name: "Local browser", location: "local" } satisfies PanelProfile;
const cloud = { id: "cloud", name: "דפדפן בענן", location: "cloud" } satisfies PanelProfile;

function job(id: string, overrides: Partial<PanelJob> = {}): PanelJob {
  return { id, threadId: "thread", laneId: "lane", profileId: local.id, state: "queued", steps: [], ...overrides };
}

function render(jobs: readonly PanelJob[], maskOff?: boolean, profiles: readonly PanelProfile[] = [local, cloud]): string {
  return renderToStaticMarkup(createElement(PomeloBrowserJobs, {
    threadId: "thread", jobs, profiles, maskOff, onPickJob: () => {},
  }));
}

test("renders the thread's jobs as ordered buttons with the active job and cloud status marked", () => {
  const html = render([
    job("b-waiting", { state: "waiting", updatedAt: 20, steps: ["Waiting for approval"] }),
    job("other", { threadId: "other-thread", state: "running", updatedAt: 40, steps: ["Other thread step"] }),
    job("a-running", { state: "running", updatedAt: 20, profileId: cloud.id, steps: ["Opened form", "Filled ••••"] }),
    job("done", { state: "done", updatedAt: 30, steps: ["Page checked"] }),
  ]);

  assert.match(html, />Masked<[\s\S]*>Runs on the VPS<[\s\S]*<ul\b/);
  const buttons = Array.from(html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g), ([button]) => button);
  assert.equal(buttons.length, 3);
  const buttonText = buttons.map((button) => Array.from(button.matchAll(/>([^<]+)</g), ([, value]) => value));
  assert.deepEqual(buttonText, [
    ["Done", "done", "Local browser", "Page checked"],
    ["Running", "running", "דפדפן בענן", "VPS", "Filled ••••"],
    ["Waiting", "waiting", "Local browser", "Waiting for approval"],
  ]);
  for (const button of buttons) assert.match(button, /^<button\b[^>]*\btype="button"/);
  assert.deepEqual(buttons.filter((button) => button.includes('aria-current="true"')), [buttons[1]]);
  assert.equal(html.match(/\saria-current=/g)?.length, 1);
  assert.match(buttons[1], /<span\b[^>]*\bdir="auto"[^>]*>דפדפן בענן<\/span>/);
  assert.doesNotMatch(html, /Other thread step|Opened form|\sautofocus\b/i);
});

test("shows the mask override and omits VPS text for local jobs", () => {
  const html = render([job("local", { state: "running" })], true, [local]);

  assert.match(html, />Masking off for this job</);
  assert.doesNotMatch(html, />Masked<|\bVPS\b/);
});

test("marks a cloud row without the panel VPS badge when the active job is local", () => {
  const html = render([
    job("past-cloud", { state: "done", profileId: cloud.id }),
    job("active-local", { state: "running" }),
  ]);

  assert.match(html, />VPS</);
  assert.doesNotMatch(html, /Runs on the VPS/);
});

test("shows a plain empty message for a thread without jobs", () => {
  const html = render([]);

  assert.match(html, />No browser jobs in this thread yet\.<\/p>/);
  assert.doesNotMatch(html, /<ul\b|<button\b/);
});

test("does not render the CDP name, cookie or field value canary", () => {
  const canary = "CANARY-725-fictional-browser-metadata";
  const jobs = [{
    ...job("canary", { state: "running", profileId: cloud.id, steps: ["Filled ••••"] }),
    cookie: canary,
    value: canary,
  } as unknown as PanelJob];
  const html = render(jobs, undefined, [{ ...cloud, cdpUrlName: canary }]);

  assert.match(html, />Filled ••••</);
  assert.equal(html.includes(canary), false);
});

function rowButtons(node: ReactNode): Array<{ onClick?: () => void }> {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) return [];
  if (node.type === "button") return [node.props];
  return Children.toArray(node.props.children).flatMap(rowButtons);
}

test("a row button passes its job id to onPickJob", () => {
  const onPickJob = test.mock.fn<(jobId: string) => void>();
  const view = PomeloBrowserJobs({
    threadId: "thread",
    jobs: [job("older", { updatedAt: 10 }), job("newer", { updatedAt: 20 })],
    profiles: [local],
    onPickJob,
  });

  const buttons = rowButtons(view);
  assert.equal(buttons.length, 2);
  const onClick = buttons[1].onClick;
  assert.ok(onClick);
  onClick();
  assert.deepEqual(onPickJob.mock.calls.map((call) => call.arguments), [["older"]]);
});
