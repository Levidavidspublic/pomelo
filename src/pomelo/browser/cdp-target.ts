export type CdpTarget =
  | { kind: "local" }
  | { kind: "cloud"; url: string }
  | { kind: "unavailable"; reason: "bad-name" | "unset" | "bad-url" | "not-local" };

export function cdpTarget(
  profile: { location: "local" | "cloud"; cdpUrlName?: string },
  env: Readonly<Record<string, string | undefined>>,
): CdpTarget {
  if (profile.location === "local") return { kind: "local" };

  const name = profile.cdpUrlName;
  if (!name || !/^POMELO_[A-Z0-9_]+$/.test(name)) return { kind: "unavailable", reason: "bad-name" };

  const url = env[name];
  if (!url) return { kind: "unavailable", reason: "unset" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "unavailable", reason: "bad-url" };
  }

  if (!/^(https?|wss?):$/.test(parsed.protocol) || parsed.username || parsed.password) {
    return { kind: "unavailable", reason: "bad-url" };
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    return { kind: "unavailable", reason: "not-local" };
  }
  return { kind: "cloud", url };
}

export function targetLabel(target: CdpTarget): string {
  switch (target.kind) {
    case "local": return "This computer";
    case "cloud": return "VPS";
    case "unavailable": return "VPS not reachable";
  }
}
