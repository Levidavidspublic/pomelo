const WORDING = {
  en: {
    noun: ["sub-agent", "sub-agents"],
    running: ["running", "running"],
    waiting: ["waiting for you", "waiting for you"],
    stuck: ["stuck", "stuck"],
  },
  he: {
    noun: ["סוכן משנה", "סוכני משנה"],
    running: ["פועל", "פועלים"],
    waiting: ["ממתין לך", "ממתינים לך"],
    stuck: ["תקוע", "תקועים"],
  },
} as const;

const STATUSES = ["running", "waiting", "stuck"] as const;

function laneCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

export function laneBadge(counts: Record<(typeof STATUSES)[number], unknown>, lang: string): {
  show: boolean;
  text: string;
  tone: "busy" | "waiting" | "stuck";
  label: string;
} {
  const running = laneCount(counts.running);
  const waiting = laneCount(counts.waiting);
  const stuck = laneCount(counts.stuck);
  const total = running + waiting + stuck;
  if (total === 0) return { show: false, text: "", tone: "busy", label: "" };

  const wording = lang.toLowerCase().split("-")[0] === "he" ? WORDING.he : WORDING.en;
  const byStatus = { running, waiting, stuck };
  const clauses: string[] = [];
  for (const status of STATUSES) {
    const count = byStatus[status];
    if (count === 0) continue;
    const form = count === 1 ? 0 : 1;
    const subject = clauses.length === 0 ? `${count} ${wording.noun[form]}` : String(count);
    clauses.push(`${subject} ${wording[status][form]}`);
  }

  return {
    show: true,
    text: total > 9 ? "9+" : String(total),
    tone: stuck > 0 ? "stuck" : waiting > 0 ? "waiting" : "busy",
    label: clauses.join(", "),
  };
}
