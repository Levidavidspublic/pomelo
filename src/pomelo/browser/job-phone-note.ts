import type { PushNote } from "../../local/phone-push.js";
import { maskConsole, NET_MASK } from "./net-mask.js";

const HOLD_TEXT = {
  "1password-locked": "unlock 1Password",
  "vps-unreachable": "the VPS is unreachable",
  captcha: "complete the CAPTCHA",
  budget: "review the job budget",
} as const;

const REDACTIONS = [
  { pattern: /(["'`])op:\/\/[^\r\n]*?\1/gi, replacement: `$1${NET_MASK}$1` },
  { pattern: /\bop:\/\/[^\s<>"'`]+/gi, replacement: NET_MASK },
  { pattern: /\b((?:set-)?cookie\s*:\s*)[^\r\n]+/gi, replacement: `$1${NET_MASK}` },
  // Preserve the host, path and any fragment text before a question mark.
  { pattern: /(\/\/[^\s<>"'`?]*)\?[^\s<>"'`#]*(#[^\s<>"'`?]*)?(?:\?[^\s<>"'`]*)?/g, replacement: "$1$2" },
];

export interface JobNoteInput {
  id: string;
  threadId: string;
  laneId: string;
  state: "queued" | "running" | "waiting" | "done" | "failed" | "cancelled";
  threadTitle: string;
  /** The one-line result from the browser's masking layer. */
  result: string;
  ranOnVps: boolean;
  holdReason?: keyof typeof HOLD_TEXT;
}

export type JobPhoneNote = Pick<PushNote, "title" | "body" | "sid"> & {
  kind: "done" | "stopped" | "question";
  lane: string;
};

function stripSensitiveParts(text: string): string {
  return REDACTIONS.reduce((value, { pattern, replacement }) => value.replace(pattern, replacement), text);
}

function safeText(text: string, known: readonly string[]): string {
  const safe = stripSensitiveParts(maskConsole(text, known));
  const stripped = stripSensitiveParts(text);
  // Mask the field if a replacement changed where a query, reference or header starts or ends.
  if (stripped !== text && safe !== maskConsole(stripped, known)) return NET_MASK;
  return safe.trim();
}

function cut(text: string, limit: number): string {
  // Friday's limits count UTF-16 units. Drop a surrogate if the cut splits a character.
  return text.slice(0, limit).replace(/[\uD800-\uDBFF]$/, "");
}

export function jobPhoneNote(job: JobNoteInput, known: readonly string[]): JobPhoneNote | null {
  const { state, holdReason, ranOnVps } = job;
  if (state !== "done" && state !== "failed" && state !== "waiting") return null;

  let kind: JobPhoneNote["kind"];
  let body: string;
  if (state === "waiting") {
    kind = "question";
    body = `Waiting for you: ${holdReason ? HOLD_TEXT[holdReason] : "check the browser job"}`;
  } else {
    kind = state === "done" ? "done" : "stopped";
    const lead = `${state === "done" ? "Done" : "Failed"}${ranOnVps ? " on the VPS" : ""}`;
    const result = safeText(job.result, known);
    body = result ? `${lead}: ${result}` : lead;
  }

  return {
    title: cut(safeText(job.threadTitle, known) || "Pomelo", 120),
    body: cut(body, 240),
    sid: job.threadId,
    kind,
    lane: job.laneId,
  } satisfies PushNote;
}
