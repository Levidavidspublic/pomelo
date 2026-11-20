import assert from "node:assert/strict";
import { test } from "node:test";
import { chatFollowReduce, chatFollowView, initialChatFollow, type ChatFollowEvent } from "../src/client/pomelo/chat-follow.js";

const scrolledUp = { type: "scrolled", scrollTop: 451, scrollHeight: 1000, clientHeight: 500 } as const;
const agentArrival = { type: "arrived", mine: false } as const;

function withUnseenMessage() {
  return chatFollowReduce(chatFollowReduce(initialChatFollow(), scrolledUp), agentArrival);
}

test("starts following without a pill and keeps following an agent arrival at the bottom", () => {
  const start = initialChatFollow();
  assert.deepEqual(start, { following: true, unseen: 0 });
  assert.deepEqual(chatFollowView(start), { scrollToBottom: true, showPill: false, pillLabel: "" });
  assert.deepEqual(chatFollowReduce(start, agentArrival), start);
});

test("scrolling more than 48 pixels from the bottom stops following", () => {
  const reading = chatFollowReduce(initialChatFollow(), scrolledUp);
  assert.deepEqual(reading, { following: false, unseen: 0 });
  assert.deepEqual(chatFollowView(reading), { scrollToBottom: false, showPill: false, pillLabel: "" });
});

test("counts agent arrivals while reading and shows the pill without scrolling", () => {
  const first = withUnseenMessage();
  assert.deepEqual(first, { following: false, unseen: 1 });
  assert.deepEqual(chatFollowView(first), {
    scrollToBottom: false,
    showPill: true,
    pillLabel: "1 new message",
  });

  const second = chatFollowReduce(first, agentArrival);
  assert.equal(chatFollowView(second).pillLabel, "2 new messages");
});

test("caps the label at 99+ while keeping the full unseen count", () => {
  let state = chatFollowReduce(initialChatFollow(), scrolledUp);
  for (let count = 1; count <= 120; count++) {
    state = chatFollowReduce(state, agentArrival);
    if (count === 99) assert.equal(chatFollowView(state).pillLabel, "99 new messages");
  }
  assert.equal(state.unseen, 120);
  assert.equal(chatFollowView(state).pillLabel, "99+ new messages");
});

test("streaming preserves the unseen count and follow mode", () => {
  for (const state of [initialChatFollow(), withUnseenMessage()]) {
    const streamed = chatFollowReduce(state, { type: "streamed" });
    assert.deepEqual(streamed, state);
    assert.equal(chatFollowView(streamed).scrollToBottom, state.following);
  }
});

test("sending a message, returning within 48 pixels, jumping or changing threads resumes following", () => {
  const state = withUnseenMessage();
  const events: ChatFollowEvent[] = [
    { type: "arrived", mine: true },
    { ...scrolledUp, scrollTop: 452 },
    { type: "jumpToLatest" },
    { type: "threadChanged" },
  ];
  for (const event of events) {
    const next = chatFollowReduce(state, event);
    assert.deepEqual(next, initialChatFollow(), event.type);
    assert.deepEqual(chatFollowView(next), chatFollowView(initialChatFollow()), event.type);
  }
});

test("invalid scroll measurements preserve state and still return a new object", () => {
  const state = withUnseenMessage();
  const atBottom = { ...scrolledUp, scrollTop: 500 };
  for (const field of ["scrollTop", "scrollHeight", "clientHeight"] as const) {
    for (const invalid of [NaN, -1, Infinity, undefined]) {
      const event = { ...atBottom, [field]: invalid };
      const next = chatFollowReduce(state, event);
      assert.deepEqual(next, state, `${field} = ${invalid}`);
      assert.notStrictEqual(next, state);
    }
  }
  const missingHeight = { type: "scrolled", scrollTop: 500, clientHeight: 500 } as const;
  assert.deepEqual(chatFollowReduce(state, missingHeight as ChatFollowEvent), state);
});

test("the reducer returns a new object without writing to frozen input", () => {
  const state = Object.freeze(withUnseenMessage());
  const next = chatFollowReduce(state, agentArrival);
  assert.notStrictEqual(next, state);
  assert.deepEqual(next, { following: false, unseen: 2 });
  assert.deepEqual(state, { following: false, unseen: 1 });
  assert.notStrictEqual(chatFollowReduce(state, { type: "streamed" }), state);
});
