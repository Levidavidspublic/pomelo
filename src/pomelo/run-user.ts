export const RISKY_GROUPS = Object.freeze(["root", "sudo", "wheel", "admin", "docker", "lxd", "disk"]);

const idLine = /^uid=(?<uid>\S+)(?:[ \t]+euid=(?<euid>\S+))?[ \t]+gid=(?<gid>\S+)(?:[ \t]+egid=(?<egid>\S+))?[ \t]+groups=(?<groups>\S+)(?:[ \t]+context=[\w.-]+:[\w.-]+:[\w.,:-]+)?$/;
const identity = /^(\d+)(?:\(([A-Za-z0-9_.@$\\-]+)\))?$/;

function parseIdentity(text: string): { id: number; name?: string } | undefined {
  const match = identity.exec(text);
  if (!match) return;
  const [, digits, name] = match;
  const id = Number(digits);
  if (!Number.isSafeInteger(id)) return;
  return { id, name };
}

/** Check worker privileges from a supplied snapshot of id output. */
export function runUserCheck(idText: unknown): { action: "go" | "stop"; user?: string; reasons: string[] } {
  const unreadable = { action: "stop" as const, reasons: ["Could not read id output."] };
  const fields = typeof idText === "string" ? idLine.exec(idText.trim())?.groups : undefined;
  if (!fields) return unreadable;

  const uid = parseIdentity(fields.uid);
  const euid = parseIdentity(fields.euid ?? fields.uid);
  if (!uid || !euid) return unreadable;

  const user = uid.name ?? String(uid.id);
  const reasons = new Set<string>();
  if (uid.id === 0 || euid.id === 0) {
    reasons.add(`User ${user} runs as root (UID 0).`);
  }

  const groups = [fields.gid, ...fields.groups.split(",")];
  if (fields.egid !== undefined) groups.push(fields.egid);
  for (const text of groups) {
    const group = parseIdentity(text);
    if (!group) return unreadable;
    const { id, name } = group;
    if (id === 0 || (name !== undefined && RISKY_GROUPS.includes(name))) {
      reasons.add(`User ${user} belongs to group ${name ?? "root"} (GID ${id}).`);
    } else if (name === undefined) {
      // Nonzero group IDs vary by host, so the number alone cannot establish safety.
      reasons.add(`Could not read the name of group GID ${id} for user ${user}.`);
    }
  }

  return { action: reasons.size ? "stop" : "go", user, reasons: [...reasons] };
}
