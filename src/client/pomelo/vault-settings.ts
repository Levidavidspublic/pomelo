import { HIDDEN, hideSecrets } from "../../secrets.js";

type LinkRecord = Partial<Record<"provider" | "account" | "vault" | "status", unknown>>;
type RefRecord = Partial<Record<"id" | "opRef" | "field" | "allowedOrigins" | "expiresAt", unknown>>;

type LinkRow = {
  status: "SET" | "UNSET" | "LOCKED";
  label: string;
  account: string;
  vault: string;
  action: "none" | "link" | "unlock";
};

type RefRow = {
  id: string;
  label: string;
  field: string;
  origins: string[];
  state: "active" | "expired";
};

const linkStates = {
  SET: { label: "Linked", action: "none" },
  UNSET: { label: "Not linked", action: "link" },
  LOCKED: { label: "Locked", action: "unlock" },
} satisfies Record<LinkRow["status"], Pick<LinkRow, "label" | "action">>;

// Stored references have a vault, item and field, with an optional section before the field.
const referencePath = /^op:\/\/([^/:@\s\\?#\p{Cc}]+)\/([^/\s\\?#\p{Cc}]+)(?:\/[^/\s\\?#\p{Cc}]+){1,2}$/u;

function isRecord(input: unknown): input is object {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

function displayText(text: string): string {
  return hideSecrets(/op:\/\//i.test(text) ? HIDDEN : text).text;
}

function linkRow(input: unknown): LinkRow {
  const { provider, account, vault, status } = isRecord(input) ? input as LinkRecord : {};
  if (provider !== "1password" || typeof account !== "string" || typeof vault !== "string" ||
    (status !== "SET" && status !== "UNSET" && status !== "LOCKED")) {
    return { status: "UNSET", label: linkStates.UNSET.label, account: "", vault: "", action: linkStates.UNSET.action };
  }

  const { label, action } = linkStates[status];
  return { status, label, account: displayText(account), vault: displayText(vault), action };
}

function originHosts(origins: readonly unknown[]): string[] {
  const hosts = new Set<string>();
  for (const origin of origins) {
    if (typeof origin !== "string" || !origin.startsWith("https://") || origin.includes("*") || !URL.canParse(origin)) continue;
    const url = new URL(origin);
    if (url.origin === origin) hosts.add(displayText(url.host));
  }
  return [...hosts].sort();
}

function refRow(input: unknown, now: number): RefRow | undefined {
  if (!isRecord(input)) return;
  const { id, opRef, field, allowedOrigins, expiresAt } = input as RefRecord;
  if (typeof id !== "string" || !id.trim() || typeof field !== "string" || !field.trim() ||
    typeof opRef !== "string" || !Array.isArray(allowedOrigins)) return;

  const path = referencePath.exec(opRef);
  if (!path) return;
  const [, vault, item] = path;
  const active = Number.isFinite(now) && (expiresAt === undefined ||
    (typeof expiresAt === "number" && Number.isFinite(expiresAt) && now < expiresAt));

  return {
    id: displayText(id),
    label: displayText(`${vault} / ${item}`),
    field: displayText(field),
    origins: originHosts(allowedOrigins),
    state: active ? "active" : "expired",
  };
}

export function vaultSettings(input: { link: unknown; refs: unknown; now: number }): { link: LinkRow; refs: RefRow[] } {
  const refs: RefRow[] = [];
  if (Array.isArray(input.refs)) {
    for (const record of input.refs) {
      const row = refRow(record, input.now);
      if (row) refs.push(row);
    }
  }
  refs.sort((a, b) => a.label.localeCompare(b.label, "en") || a.id.localeCompare(b.id, "en"));
  return { link: linkRow(input.link), refs };
}
