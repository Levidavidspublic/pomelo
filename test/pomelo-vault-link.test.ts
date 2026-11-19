import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localKV } from "../src/local/kv.js";
import { pomeloStore } from "../src/pomelo/store.js";
import { cleanVaultLink, readVaultLink, saveVaultLink, type VaultLink } from "../src/pomelo/vault-link.js";

const link: VaultLink = { provider: "1password", account: "Example account", vault: "Example vault", status: "SET" };
const unset: VaultLink = { provider: "1password", account: "", vault: "", status: "UNSET" };

async function rig(t: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-vault-link-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  return { redis: kv.redis, store: pomeloStore(kv.redis) };
}

test("vault link defaults to UNSET and saves each status at pomelo:vault", async (t) => {
  const { redis, store } = await rig(t);
  assert.deepEqual(await readVaultLink(store), unset);
  assert.equal(await redis.get("pomelo:vault"), null);

  for (const record of [link, { ...link, status: "LOCKED" }, unset] satisfies VaultLink[]) {
    await saveVaultLink(store, record);
    assert.deepEqual(await readVaultLink(store), record);
  }
  assert.equal(await redis.get("pomelo:vault"), JSON.stringify(unset));
});

test("vault link drops extra fields before saving", async (t) => {
  const { redis, store } = await rig(t);
  const canary = "vault-link-canary-42";
  const input = { ...link, token: canary, password: canary, secret: canary, value: canary };
  assert.deepEqual(cleanVaultLink(input), link);
  await saveVaultLink(store, input);

  const raw = await redis.get("pomelo:vault");
  assert.ok(raw);
  assert.ok(!raw.includes(canary));
  assert.deepEqual(JSON.parse(raw), link);
  assert.deepEqual(await redis.keys("*"), ["pomelo:vault"]);
});

test("vault link rejects invalid records and accepts 80-character names", () => {
  for (const input of [null, [], "example", {}, { ...link, provider: "other" }, { ...link, status: "READY" }]) {
    assert.ok("error" in cleanVaultLink(input));
  }

  const longest = { ...link, account: "A".repeat(80), vault: "V".repeat(80) };
  assert.deepEqual(cleanVaultLink(longest), longest);
  for (const field of ["account", "vault"] as const) {
    for (const value of [undefined, 42, "A".repeat(81), "op://example/item", " OP://example/item", "password=fixture-1234"]) {
      assert.ok("error" in cleanVaultLink({ ...link, [field]: value }), `invalid ${field}`);
    }
  }
});

test("invalid saves leave the existing vault link intact", async (t) => {
  const { redis, store } = await rig(t);
  await saveVaultLink(store, link);
  assert.ok("error" in await saveVaultLink(store, { ...link, vault: "op://example/item" }));
  assert.equal(await redis.get("pomelo:vault"), JSON.stringify(link));
});

test("vault link reads filter extra fields and fall back to UNSET for invalid records", async (t) => {
  const { redis, store } = await rig(t);
  await redis.set("pomelo:vault", JSON.stringify({ ...link, value: "vault-link-canary-42" }));
  assert.deepEqual(await readVaultLink(store), link);
  await redis.set("pomelo:vault", JSON.stringify({ ...link, account: "op://example/item" }));
  assert.deepEqual(await readVaultLink(store), unset);
});
