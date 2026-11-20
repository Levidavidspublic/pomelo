import type { Redis } from "ioredis";
import type { BusMessage } from "../bus.js";
import { decideActivityWrite } from "./activity-write.js";
import type { ActivityEventKind } from "./activity.js";
import type { PomeloStore } from "./store.js";
import { getThreadMeta, touchThread } from "./thread-meta.js";

function activityKind(value: unknown): ActivityEventKind | "delta" | undefined {
  if (typeof value !== "object" || value === null) return;
  const message = value as BusMessage;
  if (message.kind === "delta") {
    return message.channel !== "reasoning" && typeof message.text === "string" && message.text ? "delta" : undefined;
  }
  if (message.kind !== "event") return;
  const body = message.event?.body;
  const actor = message.event?.actor?.kind;
  switch (body?.type) {
    case "instruction":
      return actor === "human" || actor === "agent" ? "message" : undefined;
    case "chat":
      return "message";
    case "agent.message":
      return typeof body.text === "string" && body.text.trim() ? "message" : undefined;
    case "ui.card":
      return "card";
    case "engine.approval":
      return "approval";
    case "mesh.replied":
      return "subagent_result";
  }
}

export function pomeloActivityHook({ store, now }: { store: PomeloStore; now: () => number }) {
  const lastWrittenAt = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();

  return async function onSessionEvent(sid: unknown, event: unknown): Promise<void> {
    if (typeof sid !== "string" || !sid || sid.includes(":")) return;
    const kind = activityKind(event);
    if (!kind) return;
    const eventAt = now();

    // A burst can arrive while its first write is still in flight.
    const previous = pending.get(sid) ?? Promise.resolve();
    const update = previous.then(async () => {
      const cached = lastWrittenAt.get(sid) ?? null;
      if (decideActivityWrite({ lastWrittenAt: cached, eventAt, kind }).action === "skip") return;
      const record = await getThreadMeta(store, sid);
      if (!record || decideActivityWrite({ lastWrittenAt: record.lastActivityAt, eventAt, kind }).action === "skip") return;
      await touchThread(store, sid, eventAt);
      lastWrittenAt.set(sid, eventAt);
    }).catch(() => {});
    pending.set(sid, update);
    await update;
    if (pending.get(sid) === update) pending.delete(sid);
  };
}

/** SessionStore publishes durable events in Lua. Bus.publish sends live chunks to the same channels. */
export async function subscribeToSessionActivity(
  sub: Pick<Redis, "on" | "psubscribe">,
  prefix: string,
  onSessionEvent: ReturnType<typeof pomeloActivityHook>,
): Promise<void> {
  const start = `${prefix}{`;
  const end = "}:bus";
  const pattern = `${start.replace(/[\\*?[\]]/g, "\\$&")}*${end}`;
  sub.on("pmessage", (matched: string, channel: string, raw: string) => {
    if (matched !== pattern || !channel.startsWith(start) || !channel.endsWith(end)) return;
    try {
      void onSessionEvent(channel.slice(start.length, -end.length), JSON.parse(raw));
    } catch {
      // A malformed publication has no activity to record.
    }
  });
  await sub.psubscribe(pattern);
}
