import { isIP } from "node:net";
import type { UiCard } from "../gen-ui-model.js";

export const HOLD_REASONS = ["vault_locked", "cloud_unreachable", "import_partial"] as const;

const UNLOCKED = "I unlocked it";
const RETRY = "Retry";
const CANCEL = "Cancel job";
const IMPORT_RESULTS = ["imported", "expired", "incompatible", "skipped"] as const;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i;

interface HeldJob {
  reason: string;
  jobId: string;
  sites?: readonly { host: string; result: string }[];
}

function siteName(host: string): string {
  if (host.length <= 254 && HOSTNAME.test(host) && !isIP(host.replace(/\.$/, ""))) return host;
  return "Unknown site";
}

export function holdCard({ reason, jobId, sites }: HeldJob): UiCard & Record<string, unknown> {
  const safeJobId = /^[a-z0-9_-]{1,128}$/i.test(jobId) ? jobId : undefined;
  const job = safeJobId ? `Job ${safeJobId}` : "Browser job";

  switch (reason) {
    case "vault_locked":
      return {
        kind: "goahead",
        title: "Unlock 1Password",
        note: `${job} is waiting for the vault to unlock.`,
        commands: ["Continue the browser job after unlocking 1Password"],
        approve: UNLOCKED,
        wait: true,
      };
    case "cloud_unreachable":
      return {
        kind: "choices",
        title: "VPS not reachable",
        note: `${job} is waiting for the cloud browser.`,
        options: [{ label: RETRY }, { label: CANCEL }],
        wait: true,
      };
    case "import_partial": {
      const rows = sites?.map(({ host, result }) => [
        siteName(host),
        IMPORT_RESULTS.find((word) => word === result) ?? "unknown",
      ]);
      return {
        kind: "table",
        title: "Partial import",
        note: job,
        columns: ["Site", "Result"],
        rows: rows?.length ? rows : [["", "No site results available"]],
      };
    }
    default:
      return { kind: "table", title: "Job is waiting", columns: ["Job"], rows: [[safeJobId ?? "Browser job"]] };
  }
}

export function holdAnswer(reason: string, label: string): "retry" | "cancel" | "continue" | null {
  if (reason === "vault_locked" && label === UNLOCKED) return "continue";
  if (reason === "cloud_unreachable" && label === RETRY) return "retry";
  if (reason === "cloud_unreachable" && label === CANCEL) return "cancel";
  return null;
}
