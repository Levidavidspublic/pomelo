const stepKinds = ["open", "click", "type", "press", "scroll", "fill"] as const;

export type BrowserSkillStepKind = (typeof stepKinds)[number];
export type VaultStatus = "SET" | "UNSET" | "LOCKED";

export interface BrowserSkillStep {
  kind: BrowserSkillStepKind;
  origin: string;
  refId?: string;
  text?: string;
}

export interface BrowserSkill {
  name: string;
  steps: readonly BrowserSkillStep[];
}

export interface SkillPreflightRef {
  id: string;
  allowedOrigins: readonly string[];
  expiresAt?: number;
}

export interface SkillPreflightInput {
  skill: BrowserSkill;
  refs: readonly SkillPreflightRef[];
  vaultStatus: VaultStatus;
  now: number;
}

export type SkillPreflightWaitingReason = "ref_missing" | "ref_expired" | "vault_locked" | "vault_unset";
export type SkillPreflightRefusedReason = "value_in_skill" | "origin_not_allowed" | "bad_step";

type Waiting = { state: "waiting"; reason: SkillPreflightWaitingReason; step: number };

export type SkillPreflightResult =
  | { state: "ready" }
  | Waiting
  | { state: "refused"; reason: SkillPreflightRefusedReason; step: number };

function parseOrigin(value: string): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const origin = new URL(value).origin;
    // Opaque URLs have no origin, even though they share the string "null".
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

export function skillPreflight({ skill, refs, vaultStatus, now }: SkillPreflightInput): SkillPreflightResult {
  let waiting: Waiting | undefined;

  for (const [step, action] of skill.steps.entries()) {
    const origin = parseOrigin(action.origin);
    if (origin === undefined || !stepKinds.includes(action.kind)) {
      return { state: "refused", reason: "bad_step", step };
    }
    if (action.kind !== "fill") continue;
    if (action.text !== undefined) {
      return { state: "refused", reason: "value_in_skill", step };
    }

    const ref = action.refId ? refs.find(({ id }) => id === action.refId) : undefined;
    if (ref && !ref.allowedOrigins.some((allowed) => parseOrigin(allowed) === origin)) {
      return { state: "refused", reason: "origin_not_allowed", step };
    }

    // Keep the first wait while checking subsequent steps for refusals.
    if (waiting) continue;
    if (!ref) {
      waiting = { state: "waiting", reason: "ref_missing", step };
    } else if (ref.expiresAt !== undefined && now >= ref.expiresAt) {
      waiting = { state: "waiting", reason: "ref_expired", step };
    } else if (vaultStatus === "LOCKED") {
      waiting = { state: "waiting", reason: "vault_locked", step };
    } else if (vaultStatus === "UNSET") {
      waiting = { state: "waiting", reason: "vault_unset", step };
    }
  }

  return waiting ?? { state: "ready" };
}
