import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const toolLimits = new URL("../src/runner/tool-limits.ts", import.meta.url).href;

for (const useAppHome of [true, false]) {
  test(`tool limits read the cache ${useAppHome ? "under FRIDAY_HOME" : "under ~/.friday when FRIDAY_HOME is unset"}`, async (t) => {
    const home = await mkdtemp(path.join(tmpdir(), "pomelo-tool-limits-"));
    t.after(() => rm(home, { recursive: true, force: true }));

    const cacheDir = path.join(home, useAppHome ? "app-home" : ".friday");
    const allowance = { plan: "Test plan", windows: [], at: 1 };
    await mkdir(cacheDir);
    await writeFile(path.join(cacheDir, "tool-limits.json"), JSON.stringify({ antigravity: allowance }));

    // A fresh process has its own cache and cannot see the user's tool settings.
    const env = {
      HOME: home,
      USERPROFILE: home,
      TMPDIR: home,
      TEMP: home,
      ...(useAppHome ? { FRIDAY_HOME: cacheDir } : {}),
    };
    const script = `
      import assert from "node:assert/strict";
      import { readOtherTools } from ${JSON.stringify(toolLimits)};
      const { antigravity } = await readOtherTools({ start: false });
      assert.deepEqual(antigravity, ${JSON.stringify(allowance)});
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env, stdio: "inherit" });
    assert.ifError(result.error);
    assert.equal(result.status, 0);
  });
}
