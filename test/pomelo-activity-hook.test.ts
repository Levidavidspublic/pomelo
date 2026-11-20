import assert from "node:assert/strict";
import test from "node:test";
import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { Bus, type BusMessage } from "../src/bus.js";
import { pomeloActivityHook, subscribeToSessionActivity } from "../src/pomelo/activity-hook.js";
import type { PomeloStore } from "../src/pomelo/store.js";
import type { ThreadRecord } from "../src/pomelo/thread-meta.js";
import { SessionStore } from "../src/session/store.js";
import type { ActorRef, EventBody } from "../src/types.js";

const human = { id: "person", name: "Person", kind: "human" } as const;
const agent = { id: "agent", name: "Agent", kind: "agent" } as const;
const instruction = { type: "instruction", text: "Draft the notes.", interrupt: false } as const;
const reply = { type: "agent.message", text: "The draft is ready.", toolCalls: [] } satisfies EventBody;
const delta = { kind: "delta", text: "Draft", channel: "text" } as const;

function published(actor: ActorRef, body: EventBody): BusMessage {
  return { kind: "event", event: { seq: 1, ts: 5_000, actor, body } };
}

function setup(t: test.TestContext, sids = ["thread"]) {
  let at = 10_000;
  const records = new Map<string, ThreadRecord>(sids.map((sid) => [
    `thread:${sid}`, { sid, projectTags: ["docs"], lastActivityAt: 5_000, openedBy: "agent" },
  ]));
  const store = {
    async get<T>(key: string) { return (records.get(key) ?? null) as T | null; },
    set: t.mock.fn<PomeloStore["set"]>(async (key, value) => {
      records.set(key, value as ThreadRecord);
      return true;
    }),
    async list() { assert.fail("unexpected list"); },
    async appendLog() { assert.fail("unexpected appendLog"); },
  } satisfies PomeloStore;
  return {
    onSessionEvent: pomeloActivityHook({ store, now: () => at }), store, records,
    advance(ms: number) { at += ms; },
    writes: () => store.set.mock.calls.map(({ arguments: [key, record] }) => [key, (record as ThreadRecord).lastActivityAt]),
  };
}

test("a published user instruction and agent reply each advance activity", async (t) => {
  const { onSessionEvent, advance, records, writes } = setup(t);
  await onSessionEvent("thread", published(human, instruction));
  advance(1);
  await onSessionEvent("thread", published(agent, reply));

  assert.deepEqual(writes(), [["thread:thread", 10_000], ["thread:thread", 10_001]]);
  assert.deepEqual(records.get("thread:thread"), {
    sid: "thread", projectTags: ["docs"], lastActivityAt: 10_001, openedBy: "agent",
  });
});

test("a concurrent burst of streamed chunks writes once within the minimum gap", async (t) => {
  const { onSessionEvent, advance, writes } = setup(t);
  const burst = [onSessionEvent("thread", delta)];
  for (const ms of [1, 998, 1_000]) {
    advance(ms);
    burst.push(onSessionEvent("thread", delta));
  }
  await Promise.all(burst);
  assert.deepEqual(writes(), [["thread:thread", 10_000]]);

  advance(1);
  await onSessionEvent("thread", delta);
  assert.deepEqual(writes(), [["thread:thread", 10_000], ["thread:thread", 12_000]]);
});

test("presence, focus, typing, reasoning and unknown events never write activity", async (t) => {
  const { onSessionEvent, writes } = setup(t);
  for (const event of [
    { kind: "presence", members: [] },
    { kind: "focus", id: "person", at: null },
    { kind: "typing" },
    { kind: "unrecognised" },
    { ...delta, channel: "reasoning" },
    published({ ...agent, kind: "system" }, instruction),
    published(agent, { ...reply, text: "" }),
    published(agent, { type: "run.ended", outcome: "done" }),
  ]) await onSessionEvent("thread", event);
  assert.deepEqual(writes(), []);
});

test("activity in a Friday-only session does not create a Pomelo record", async (t) => {
  const { onSessionEvent, records, writes } = setup(t, []);
  await onSessionEvent("thread", published(human, instruction));
  assert.equal(records.size, 0);
  assert.deepEqual(writes(), []);
});

test("store failure is swallowed and the next event can retry", async (t) => {
  const { onSessionEvent, advance, records, store } = setup(t);
  t.mock.method(store, "get").mock.mockImplementationOnce(async () => { throw new Error("read failed"); });
  store.set.mock.mockImplementationOnce(async () => { throw new Error("write failed"); });
  await assert.doesNotReject(() => onSessionEvent("thread", delta));
  advance(1);
  await assert.doesNotReject(() => onSessionEvent("thread", delta));
  assert.equal(records.get("thread:thread")?.lastActivityAt, 5_000);

  advance(1);
  await onSessionEvent("thread", delta);
  assert.equal(records.get("thread:thread")?.lastActivityAt, 10_002);
});

test("streaming activity uses a separate write window for each thread", async (t) => {
  const { onSessionEvent, advance, records, writes } = setup(t, ["first", "second"]);
  await onSessionEvent("first", delta);
  advance(1);
  await Promise.all([onSessionEvent("first", delta), onSessionEvent("second", delta)]);
  assert.equal(records.get("thread:first")?.lastActivityAt, 10_000);
  assert.equal(records.get("thread:second")?.lastActivityAt, 10_001);
  assert.equal(writes().length, 2);
});

test("missing and non-string session IDs are ignored", async (t) => {
  const { onSessionEvent, store, writes } = setup(t);
  const get = t.mock.method(store, "get");
  for (const sid of [undefined, null, 42, {}, "", "invalid:sid"]) {
    await onSessionEvent(sid, published(human, instruction));
  }
  assert.equal(get.mock.callCount(), 0);
  assert.deepEqual(writes(), []);
});

test("the subscription sees durable messages and streamed replies without a room subscriber", async (t) => {
  const { onSessionEvent, advance, writes } = setup(t);
  const pub = new (RedisMock as unknown as new () => Redis)();
  const sub = pub.duplicate();
  t.after(() => { sub.disconnect(); pub.disconnect(); });
  const prefix = "activity:";
  const sessions = new SessionStore(pub, prefix);
  const bus = new Bus(pub, sub, prefix);
  await Promise.all([subscribeToSessionActivity(sub, prefix, onSessionEvent), bus.start()]);

  assert.equal((await sessions.append("thread", human, instruction)).ok, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  advance(2_000);
  await bus.publish("thread", delta);
  await new Promise<void>((resolve) => setImmediate(resolve));
  advance(1);
  assert.equal((await sessions.append("thread", agent, reply)).ok, true);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(writes(), [["thread:thread", 10_000], ["thread:thread", 12_000], ["thread:thread", 12_001]]);
});
