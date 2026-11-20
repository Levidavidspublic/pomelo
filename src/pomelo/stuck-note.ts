import { hideSecrets, HIDDEN } from "../secrets.js";

const ATTEMPT_LIMIT = 3;
const ERROR_LIMIT = 160;
const REDACTED = "[hidden]";
const TERMINAL_ESCAPE = /(?:\u001b\]|\u009d)[^\u0007\u001b\u009c]*(?:\u0007|\u001b\\|\u009c|$)|(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
const CREDENTIAL_LABEL = /((?<![\w.-])(?:[\w.-]*(?:secret|token|password|passwd|passphrase|apikey|credential)[\w.-]*|(?:[\w.-]+[_.-])?key)["']?\s*[:=]\s*)/;
const CREDENTIAL_VALUE = /(?:(?:bearer|basic)\s+)?(?:(?<quote>["'`])(?:\\.|(?!\k<quote>)[^\\])*(?:\k<quote>|\\?$)|\S+)/;
const CREDENTIAL_ASSIGNMENT = new RegExp(CREDENTIAL_LABEL.source + CREDENTIAL_VALUE.source, "gi");

interface TicketRef {
  readonly number: number;
  readonly key: string;
}

interface Ticket extends TicketRef {
  readonly title: string;
}

interface Attempt {
  readonly step: "test" | "typecheck" | "review" | "merge conflict" | "timeout";
  readonly firstErrorLine: string;
}

function safeFirstLine(text: string): string {
  const [firstLine] = text.split(/[\r\n\u0085\u2028\u2029]/, 1);
  const plain = firstLine.replace(TERMINAL_ESCAPE, "").replaceAll("\t", " ").replace(/[\p{Cc}\p{Cf}]/gu, "");
  // Explicit credential labels can carry short or quoted values that Friday leaves alone.
  const withoutCredentials = plain
    .replace(CREDENTIAL_ASSIGNMENT, `$1${REDACTED}`)
    .replace(/\b(Bearer|Basic)\s+\S+/gi, `$1 ${REDACTED}`);
  // Friday keeps the recognizable prefix of some tokens. Replace it too in this note.
  return hideSecrets(withoutCredentials).text
    .replace(/[\w./-]+…\[secret hidden\]/g, REDACTED)
    .replaceAll(HIDDEN, REDACTED)
    .trim();
}

function errorExcerpt(text: string): string {
  const line = safeFirstLine(text);
  if (line.length <= ERROR_LIMIT) return line || "No error details.";

  const cutAt = ERROR_LIMIT - 1;
  const markerStart = line.lastIndexOf(REDACTED, cutAt);
  const splitsMarker = markerStart !== -1 && markerStart + REDACTED.length > cutAt;
  const excerpt = line.slice(0, splitsMarker ? markerStart : cutAt).replace(/[\uD800-\uDBFF]$/, "");
  return `${excerpt.trimEnd()}…`;
}

function ticketLabel({ number, key }: TicketRef): string {
  return `#${number} ${safeFirstLine(key)}`.trimEnd();
}

export function buildStuckNote(ticket: Ticket, attempts: readonly Attempt[], dependants: readonly TicketRef[]): { title: string; lines: string[] } {
  const label = ticketLabel(ticket);
  const title = safeFirstLine(ticket.title) || label;
  if (attempts.length < ATTEMPT_LIMIT) return { title, lines: [`${label} is not stuck yet`] };

  const attemptLines = attempts.slice(0, ATTEMPT_LIMIT).map(({ step, firstErrorLine }, index) =>
    `Attempt ${index + 1} (${step}) — ${errorExcerpt(firstErrorLine)}`,
  );
  const waiting = [...dependants].sort((a, b) => a.number - b.number).map(ticketLabel);
  return {
    title,
    lines: [
      `${label} is stuck after ${ATTEMPT_LIMIT} attempts`,
      ...attemptLines,
      waiting.length ? `Waiting on it — ${waiting.join(", ")}` : "Nothing is waiting on it.",
      "Next step — Hand the ticket to Amit.",
    ],
  };
}
