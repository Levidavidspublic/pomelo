interface RailThread {
  sid: string;
  title: string;
  lastActivityAt?: number;
}

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function timeLabel(at: number | undefined, now: number): string {
  if (typeof at !== "number") return "";
  const activity = new Date(at);
  if (Number.isNaN(activity.getTime())) return "";

  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "now";

  const start = new Date(now);
  const today = start.setHours(0, 0, 0, 0);
  if (at >= today) return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;

  start.setDate(start.getDate() - 1);
  const yesterday = start.setHours(0, 0, 0, 0);
  return at >= yesterday ? "Yesterday" : shortDate.format(activity);
}

export function railRow(thread: RailThread, unread: ReadonlySet<string>, now: number) {
  return {
    sid: thread.sid,
    title: thread.title.trim() ? thread.title : "Untitled",
    timeLabel: timeLabel(thread.lastActivityAt, now),
    unread: unread.has(thread.sid),
  };
}
