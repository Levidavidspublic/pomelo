import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const limits = new URL("../src/runner/limits.ts", import.meta.url).href;
const toolUpdates = new URL("../src/runner/tool-updates.ts", import.meta.url).href;
const cases = [
  { description: "under FRIDAY_HOME", folder: "app-home", appHome: true },
  { description: "under FRIDAY_STATE_DIR when it overrides FRIDAY_HOME", folder: "state", appHome: true, stateDir: true },
  { description: "under FRIDAY_STATE_DIR when only it is set", folder: "state", stateDir: true },
  { description: "under ~/.friday when neither home is set", folder: ".friday" },
];

for (const { description, folder, appHome, stateDir } of cases) {
  test(`Claude limits and tool updates write their caches ${description}`, async (t) => {
    const home = await mkdtemp(path.join(tmpdir(), "pomelo-limits-"));
    t.after(() => rm(home, { recursive: true, force: true }));

    // A fresh process isolates the home and waits for the asynchronous cache writes before exiting.
    const env = {
      HOME: home,
      USERPROFILE: home,
      TMPDIR: home,
      TEMP: home,
      ...(appHome ? { FRIDAY_HOME: path.join(home, "app-home") } : {}),
      ...(stateDir ? { FRIDAY_STATE_DIR: path.join(home, "state") } : {}),
    };
    const script = `
      import { noteClaudeEvent } from ${JSON.stringify(limits)};
      import { setAutoUpdates } from ${JSON.stringify(toolUpdates)};
      process.chdir(process.env.HOME);
      noteClaudeEvent({ type: "rate_limit_event", rate_limit_info: { rateLimitType: "five_hour" } });
      await setAutoUpdates(false);
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env, stdio: "inherit" });
    assert.ifError(result.error);
    assert.equal(result.status, 0);
    assert.deepEqual((await readdir(path.join(home, folder))).sort(), ["claude-limits.json", "tool-updates.json"]);
    for (const other of ["app-home", "state", ".friday"]) {
      if (other !== folder) assert.equal(existsSync(path.join(home, other)), false, `unexpected cache directory ${other}`);
    }
  });
}
