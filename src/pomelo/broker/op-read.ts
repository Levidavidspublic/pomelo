import { canFill, type Grant } from "../grant.js";
import type { SecretRef } from "../secret-ref.js";

type BrokerFillOptions = {
  grant: Grant;
  ref: SecretRef;
  context: Parameters<typeof canFill>[2];
  run: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
  fill: (value: string) => Promise<void>;
};

type BrokerFillResult = { status: "filled" | "denied" | "locked" | "not_found" | "failed" };

export function opReadArgs(ref: SecretRef): string[] {
  const { opRef } = ref;
  if (typeof opRef !== "string" || !opRef.startsWith("op://") || /\s/u.test(opRef)) {
    throw new TypeError("Invalid 1Password reference");
  }
  return ["read", "--no-newline", opRef];
}

export async function brokerFill({ grant, ref, context, run, fill }: BrokerFillOptions): Promise<BrokerFillResult> {
  try {
    if (!canFill(grant, ref, context)) return { status: "denied" };

    const { code, stdout, stderr } = await run(opReadArgs(ref));
    if (code === 0) {
      if (stdout === "") return { status: "not_found" };
      await fill(stdout);
      return { status: "filled" };
    }

    if (/\b(?:not signed in|session expired|locked|authorization prompt dismissed)\b/i.test(stderr)) {
      return { status: "locked" };
    }
    if (/\b(?:isn't an item|not found|no item)\b/i.test(stderr)) return { status: "not_found" };
    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
