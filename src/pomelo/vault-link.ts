import { hideSecrets } from "../secrets.js";
import type { PomeloStore } from "./store.js";

export type VaultStatus = "SET" | "UNSET" | "LOCKED";

export interface VaultLink {
  provider: "1password";
  account: string;
  vault: string;
  status: VaultStatus;
}

type VaultLinkResult = VaultLink | { error: string };

const VAULT_KEY = "vault";
const UNSET_LINK: VaultLink = { provider: "1password", account: "", vault: "", status: "UNSET" };

function isDisplayName(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 80
    && !/^op:\/\//i.test(value.trimStart())
    && hideSecrets(value).text === value;
}

export function cleanVaultLink(input: unknown): VaultLinkResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Expected a vault link record" };
  }

  const { provider, account, vault, status } = input as Record<string, unknown>;
  if (provider !== "1password") return { error: "Unsupported vault provider" };
  if (status !== "SET" && status !== "UNSET" && status !== "LOCKED") return { error: "Invalid vault status" };
  if (!isDisplayName(account)) return { error: "Invalid account display name" };
  if (!isDisplayName(vault)) return { error: "Invalid vault name" };

  return { provider, account, vault, status };
}

export async function saveVaultLink(store: PomeloStore, link: unknown): Promise<VaultLinkResult> {
  const clean = cleanVaultLink(link);
  if ("error" in clean) return clean;
  if (!await store.set(VAULT_KEY, clean)) return { error: "Could not save the vault link" };
  return clean;
}

export async function readVaultLink(store: PomeloStore): Promise<VaultLink> {
  const clean = cleanVaultLink(await store.get(VAULT_KEY));
  return "error" in clean ? { ...UNSET_LINK } : clean;
}
