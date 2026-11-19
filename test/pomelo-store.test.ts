import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { localKV } from "../src/local/kv.js";
import { pomeloStore } from "../src/pomelo/store.js";
import { getTag, listTags, saveTag, tagSlug } from "../src/pomelo/tags.js";
import { HIDDEN } from "../src/secrets.js";

async function rig(t: test.TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "pomelo-store-"));
  const kv = await localKV(home, 60_000);
  t.after(async () => {
    await kv.close();
    await rm(home, { recursive: true, force: true });
  });
  return { home, redis: kv.redis, store: pomeloStore(kv.redis), flush: kv.flush };
}

test("Pomelo round-trips JSON and lists its matching records in key order", async (t) => {
  const { redis, store } = await rig(t);
  const fridayKey = "friday:tag:alpha";
  await redis.set(fridayKey, '"Friday record"');
  const value = { label: "Zebra", flags: [true, null, 3] };

  await store.set("tag:zebra", value);
  for (let i = 0; i < 105; i++) await store.set(`job:${i}`, i);
  await store.set("tag:alpha", null);
  await store.appendLog("tag:history", { action: "saved" });

  assert.deepEqual(await store.get("tag:zebra"), value);
  assert.equal(await store.get("tag:missing"), null);
  assert.deepEqual(await store.list("tag:"), [
    { key: "tag:alpha", value: null },
    { key: "tag:zebra", value },
  ]);
  assert.equal(await store.get(fridayKey), null);
  assert.equal(await redis.get(fridayKey), '"Friday record"');
  const keys = (await redis.keys("*")).filter((key) => key !== fridayKey);
  assert.equal(keys.length, 108);
  assert.ok(keys.every((key) => key.startsWith("pomelo:")));
});

test("Pomelo treats list prefixes as literal and scopes a custom prefix under pomelo", async (t) => {
  const { redis, store } = await rig(t);
  const scoped = pomeloStore(redis, "sample:");
  await store.set("tag:*literal", 1);
  await store.set("tag:other", 2);
  await scoped.set("tag:other", 3);
  await redis.set("sample:tag:other", "4");

  assert.deepEqual(await store.list("tag:*"), [{ key: "tag:*literal", value: 1 }]);
  assert.deepEqual(await scoped.list("tag:"), [{ key: "tag:other", value: 3 }]);
  assert.equal(await scoped.get("tag:*literal"), null);
  assert.equal(await redis.get("pomelo:sample:tag:other"), "3");
  assert.equal(await redis.get("sample:tag:other"), "4");
});

test("Pomelo shields records and appends shielded events in order to Friday's JSONL logs", async (t) => {
  const { home, redis, store, flush } = await rig(t);
  const value = { steps: ["password=pomelo-canary-1234"] };
  const masked = { steps: [`password=${HIDDEN}`] };
  await store.set("job:sample", value);
  await store.appendLog("audit", { action: "started" });
  await store.appendLog("audit:events", value);

  assert.equal(await redis.get("pomelo:job:sample"), JSON.stringify(masked));
  assert.deepEqual(await redis.lrange("pomelo:audit:events", 0, -1), [
    JSON.stringify({ action: "started" }),
    JSON.stringify(masked),
  ]);
  await flush();
  assert.match((await readdir(path.join(home, "logs"))).join("\n"), /^[a-f0-9]+\.jsonl$/);
});

test("project tags use normalised slugs and keep their first creator across saves", async (t) => {
  const { redis, store } = await rig(t);
  const slug = tagSlug("  Sample / Project__42!  ");
  assert.equal(slug, "sample-project-42");
  assert.equal(tagSlug("A".repeat(50)), "a".repeat(40));

  const original = { slug, label: "Sample Project 42", createdBy: "agent:first" };
  const updated = { slug, label: "Sample Project", colour: "blue", createdBy: "agent:second" };
  await Promise.all([saveTag(store, original), saveTag(pomeloStore(redis), updated)]);
  const saved = { ...updated, createdBy: original.createdBy };
  assert.deepEqual(await getTag(store, slug), saved);
  assert.deepEqual(JSON.parse((await redis.get(`pomelo:tag:${slug}`))!), saved);

  const another = { slug: "alpha", label: "Alpha", createdBy: "agent:first" };
  await saveTag(store, another);
  assert.deepEqual(await listTags(store), [another, saved]);
  assert.equal(await getTag(store, "missing"), null);
});
