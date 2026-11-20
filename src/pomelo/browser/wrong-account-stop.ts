export interface SignedInAccountInput {
  expected?: string;
  seen: readonly { text: string; where: string }[];
}

const ALLOWED_ANSWERS = Object.freeze([
  "I switched it myself",
  "Carry on in this account",
  "Cancel the job",
] as const);

const FORBIDDEN_ACTIONS = Object.freeze([
  "switch_account",
  "sign_out",
  "add_account",
  "broker_fill",
] as const);

type AccountHold = {
  stop: true;
  status: "waiting";
  reason: "wrong_account" | "bad_input";
  card: { body: string; allowedAnswers: typeof ALLOWED_ANSWERS };
  forbiddenActions: typeof FORBIDDEN_ACTIONS;
};

export type SignedInAccountResult = { stop: false; match: "same" | "unknown" } | AccountHold;

function normalizeAccount(text: string): string {
  return text.trim().toLowerCase().normalize("NFC");
}

// Keep a domain only when the whole mark has the shape of an address.
const ADDRESS = /^[^\s@\p{C}]+@([\p{L}\p{M}\p{N}-]+(?:\.[\p{L}\p{M}\p{N}-]+)*)$/u;

export function shortAccount(text: string): string {
  const account = text.trim();
  const first = /^[^\p{C}]/u.exec(account)?.[0] ?? "";
  const domain = ADDRESS.exec(account)?.[1];
  const shortened = `${first}…${domain ? `@${domain}` : ""}`;
  return shortened === account ? "…" : shortened;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hold(reason: AccountHold["reason"], body: string): AccountHold {
  return {
    stop: true,
    status: "waiting",
    reason,
    card: { body, allowedAnswers: ALLOWED_ANSWERS },
    forbiddenActions: FORBIDDEN_ACTIONS,
  };
}

function unreadableAccounts(): AccountHold {
  return hold("bad_input", "Could not read the account information. The job is waiting for Amit.");
}

/** Compares the account marks from a masked read for the browser job's handoff. */
export function checkSignedInAccount(input: unknown): SignedInAccountResult {
  try {
    if (!isRecord(input)) return unreadableAccounts();
    const { expected, seen } = input;
    if ((expected !== undefined && typeof expected !== "string") || !Array.isArray(seen)) {
      return unreadableAccounts();
    }

    const accounts = new Set<string>();
    for (const mark of seen as readonly unknown[]) {
      if (!isRecord(mark)) return unreadableAccounts();
      const { text, where } = mark;
      if (typeof text !== "string" || typeof where !== "string") return unreadableAccounts();
      const account = normalizeAccount(text);
      if (account) accounts.add(account);
    }

    const wanted = normalizeAccount(expected ?? "");
    if (!wanted || accounts.size === 0) return { stop: false, match: "unknown" };

    const multipleAccounts = accounts.size > 1;
    accounts.delete(wanted);
    const other = accounts.values().next().value;
    if (other === undefined) return { stop: false, match: "same" };

    const shortened = shortAccount(other);
    const body = multipleAccounts
      ? `Amit, the page shows more than one account (including ${shortened}).`
      : `Amit, the site is signed in as a different account (${shortened}).`;
    return hold("wrong_account", body);
  } catch {
    return unreadableAccounts();
  }
}
