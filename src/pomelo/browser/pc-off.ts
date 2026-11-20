import type { ProfileHome } from "./profile-home.js";

type VaultAccess = "vps" | "pc" | "LOCKED";

export type PcOffFacts = {
  profileHome: ProfileHome;
  worker: ProfileHome;
  importsPcChrome: boolean;
  /** Whether any upload in the job uses a folder on the PC. */
  hasPcUpload: boolean;
} & (
  | { needsFill: false; vaultAccess?: VaultAccess }
  | { needsFill: true; vaultAccess: VaultAccess }
);

export type PcOffVerdict = {
  verdict: "can-finish" | "needs-pc" | "hold-for-amit";
  reasons: string[];
};

function readFact(facts: unknown, key: keyof PcOffFacts): unknown {
  if (typeof facts !== "object" || facts === null) return undefined;
  try {
    // Read only facts supplied as data, without calling getters or using inherited defaults.
    return Object.getOwnPropertyDescriptor(facts, key)?.value;
  } catch {
    return undefined;
  }
}

/** Check the job's PC dependencies. A hold takes priority while keeping every known dependency in the reasons. */
export function checkPcOff(facts: unknown): PcOffVerdict {
  const reasons: string[] = [];
  let needsAmit = false;
  function hold(reason: string): void {
    needsAmit = true;
    reasons.push(reason);
  }

  const profileHome = readFact(facts, "profileHome");
  if (profileHome === "pc") reasons.push("profile lives on the PC");
  else if (profileHome !== "vps") hold("profile location is unknown");

  const worker = readFact(facts, "worker");
  if (worker === "pc") reasons.push("worker runs on the PC");
  else if (worker !== "vps") hold("worker location is unknown");

  const needsFill = readFact(facts, "needsFill");
  if (needsFill === true) {
    const vaultAccess = readFact(facts, "vaultAccess");
    if (vaultAccess === "pc") reasons.push("fill needs 1Password on the PC");
    else if (vaultAccess === "LOCKED") hold("1Password vault is locked");
    else if (vaultAccess !== "vps") hold("1Password vault access is unknown");
  } else if (needsFill !== false) {
    hold("whether the job needs a 1Password fill is unknown");
  }

  const importsPcChrome = readFact(facts, "importsPcChrome");
  if (importsPcChrome === true) reasons.push("import needs Chrome on the PC");
  else if (importsPcChrome !== false) hold("whether the job imports from PC Chrome is unknown");

  const hasPcUpload = readFact(facts, "hasPcUpload");
  if (hasPcUpload === true) reasons.push("upload needs a folder on the PC");
  else if (hasPcUpload !== false) hold("whether an upload needs a PC folder is unknown");

  if (needsAmit) return { verdict: "hold-for-amit", reasons };
  return { verdict: reasons.length > 0 ? "needs-pc" : "can-finish", reasons };
}
