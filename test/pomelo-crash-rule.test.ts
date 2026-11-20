import assert from "node:assert/strict";
import test from "node:test";
import { decideAfterCrash } from "../src/pomelo/browser/crash-rule.js";

type CrashInput = Parameters<typeof decideAfterCrash>[0];
type CrashCase = [
  name: string,
  overrides: Partial<CrashInput>,
  verdict: ReturnType<typeof decideAfterCrash>["verdict"],
];

const firstCrash: CrashInput = {
  what: "page",
  crashesThisJob: 1,
  lastStepKind: "read",
  stepFinished: true,
  location: "local",
};

const cases: CrashCase[] = [
  ["reloads after a finished read", {}, "reload"],
  ["reloads after a finished navigation", { lastStepKind: "navigate" }, "reload"],
  ["restarts the browser after a finished navigation", { what: "browser", lastStepKind: "navigate" }, "restart-browser"],
  ["holds during a fill", { lastStepKind: "fill", stepFinished: false }, "hold"],
  ["holds after a finished fill", { lastStepKind: "fill" }, "hold"],
  ["holds after a browser crash during a fill", { what: "browser", lastStepKind: "fill", stepFinished: false }, "hold"],
  ["holds during an import", { lastStepKind: "import", stepFinished: false }, "hold"],
  ["holds after a finished import", { lastStepKind: "import" }, "hold"],
  ["holds during an upload", { lastStepKind: "upload", stepFinished: false }, "hold"],
  ["holds after a finished upload", { lastStepKind: "upload" }, "hold"],
  ["holds during a click", { lastStepKind: "click", stepFinished: false }, "hold"],
  ["reloads after a finished click", { lastStepKind: "click" }, "reload"],
  ["holds during a read", { stepFinished: false }, "hold"],
  ["holds during navigation", { lastStepKind: "navigate", stepFinished: false }, "hold"],
  ["holds during typing", { lastStepKind: "type", stepFinished: false }, "hold"],
  ["reloads after finished typing", { lastStepKind: "type" }, "reload"],
  ["holds during a download", { lastStepKind: "download", stepFinished: false }, "hold"],
  ["reloads after a finished download", { lastStepKind: "download" }, "reload"],
  ["reloads before any step begins", { lastStepKind: "none", stepFinished: false }, "reload"],
  ["holds on the second crash", { crashesThisJob: 2 }, "hold"],
  ["holds on the third crash", { what: "browser", crashesThisJob: 3 }, "hold"],
  ["fails on the fourth crash", { crashesThisJob: 4 }, "fail"],
  ["fails past the crash limit even after a fill", { crashesThisJob: 5, lastStepKind: "fill" }, "fail"],
  ["holds for an unknown step", { lastStepKind: "unrecognized-step" as CrashInput["lastStepKind"] }, "hold"],
];

for (const [name, overrides, verdict] of cases) {
  test(name, () => {
    for (const location of ["local", "cloud"] as const) {
      const result = decideAfterCrash({ ...firstCrash, ...overrides, location });
      assert.equal(result.verdict, verdict, location);
      assert.equal(result.replayLastStep, false);
      assert.ok(result.reason.trim());
      assert.doesNotMatch(result.reason, /[\n\v\f\r\u0085\u2028\u2029]|unrecognized-step/);
      assert.equal(result.reason.includes("on the VPS"), location === "cloud");
    }
  });
}
