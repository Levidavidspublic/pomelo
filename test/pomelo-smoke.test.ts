import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { startLocal, type Started } from "../src/local/start.js";

// Keep background tool update checks out of the loopback smoke test.
process.env.FRIDAY_NO_TOOL_UPDATES = "1";

async function startSmokeServer(t: TestContext): Promise<Started> {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-smoke-"));
  let started: Started | undefined;
  t.after(async () => {
    try {
      await started?.close();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
  started = await startLocal({ home, port: 0 });
  return started;
}

test("the local server serves the app shell at the root URL", async (t) => {
  const started = await startSmokeServer(t);
  const url = new URL(started.url);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/");

  const response = await fetch(started.url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html(?:;|$)/i);
  assert.ok((await response.text()).includes('<div id="root"></div>'), "the shell contains the root mount element");
});

test("the local server refuses connections after close", async (t) => {
  const started = await startSmokeServer(t);
  const port = Number(new URL(started.url).port);
  assert.ok(port > 0, "the local server reports its assigned port");
  await started.close();

  const socket = connect({ host: "127.0.0.1", port });
  try {
    await assert.rejects(once(socket, "connect", { signal: AbortSignal.timeout(5_000) }), { code: "ECONNREFUSED" });
  } finally {
    socket.destroy();
  }
});

test("the local server starts a new instance for a fresh home", async (t) => {
  const started = await startSmokeServer(t);
  assert.ok(!started.already);
});
