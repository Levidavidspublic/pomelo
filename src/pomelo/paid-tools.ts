export const REQUIRED_PAID_TOOLS = Object.freeze(["coderabbit", "cursor-bugbot", "vercel-agent", "copilot"] as const);

interface BlockedPaidTool {
  name: string;
  reason: "missing" | "uncapped" | "bad-cap" | "unknown-state";
}

export function paidToolGate(
  tools: readonly unknown[],
  required: readonly string[] = REQUIRED_PAID_TOOLS,
): { ok: boolean; blocked: BlockedPaidTool[] } {
  const blocked: BlockedPaidTool[] = [];
  const listed = new Set<string>();

  for (const tool of tools) {
    if (typeof tool !== "object" || tool === null) {
      blocked.push({ name: "(unknown)", reason: "unknown-state" });
      continue;
    }

    const { name, state, cap } = tool as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) {
      blocked.push({ name: "(unknown)", reason: "unknown-state" });
      continue;
    }

    listed.add(name.trim().toLowerCase());
    switch (state) {
      case "off":
        break;
      case "on":
        blocked.push({ name, reason: "uncapped" });
        break;
      case "capped":
        if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0) {
          blocked.push({ name, reason: "bad-cap" });
        }
        break;
      default:
        blocked.push({ name, reason: "unknown-state" });
    }
  }

  for (const name of required) {
    if (!listed.has(name.trim().toLowerCase())) {
      blocked.push({ name, reason: "missing" });
    }
  }

  return { ok: blocked.length === 0, blocked };
}
