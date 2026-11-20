type RailChangeKind = "thread-activity" | "thread-tags" | "thread-title";

interface RailFields {
  title: string;
  projectTags: readonly string[];
  lastActivityAt?: number;
  openedBy?: string;
  parentThreadId?: string;
}

export type RailEvent = { sid: string } & (
  | ({ kind: "thread-opened" } & RailFields)
  | ({ kind: RailChangeKind | readonly RailChangeKind[] } & Partial<RailFields>)
);

// Credential shapes used by Friday's secret shield, plus vault references and bare tokens.
const CREDENTIAL_PATTERNS = [
  /(?<![A-Za-z0-9])Bearer\s+[A-Za-z0-9._~+/=-]+/i,
  /(?<![A-Za-z0-9])(?:sk-|gh[pousr]_)[A-Za-z0-9_-]+/,
  /(?<![A-Za-z0-9])(?:github_pat_[A-Za-z0-9_]{40,}|glpat-[A-Za-z0-9_-]{20,}|xox[abposr]-[A-Za-z0-9-]{10,})/,
  /(?<![A-Za-z0-9])(?:(?:sk|rk)_(?:live|test)_|whsec_)[A-Za-z0-9]{16,}/,
  /(?<![A-Za-z0-9])(?:AIza[A-Za-z0-9_-]{35}|(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9]))/,
  /(?<![A-Za-z0-9])(?:(?:phx_|hf_)[A-Za-z0-9]{30,}|(?:gsk_|xai-)[A-Za-z0-9]{40,}|re_[A-Za-z0-9_]{24,})/,
  /(?<![A-Za-z0-9])(?:npm_[A-Za-z0-9]{36}(?![A-Za-z0-9])|fw_[a-z]{2,8}_[A-Za-z0-9_-]{30,})/,
  /(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
  /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /hooks\.[a-z0-9.-]+\/services\/[A-Za-z0-9/_-]{20,}|discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]{30,}/,
  /(?<![A-Za-z0-9])op:\/\/[^\s"'<>]+|"op:\/\/[^"]+"|'op:\/\/[^']+'/i,
  /(?<![A-Za-z0-9])(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|https?|ftp):\/\/[^:\s/@]+:[^@\s/]+@/,
];
const ASSIGNED_CREDENTIAL = /(?:^|[\s"'*{,(])["']?[A-Za-z0-9_.-]*(?:secret|token|password|passwd|passphrase|(?:api|access|private|auth)[_-]?key|credentials?)[A-Za-z0-9_.-]*["']?\s*([:=])\s*(?:"[^"]+"|'[^']+'|([^\s"'\x60,;)}\]]+))/gi;
const CREDENTIAL_REFERENCE = /^(?:process\.env|os\.environ|import\.meta|env\.|config\.|settings\.|secrets\.|\$\{|\$[A-Z_]|<|\(|\[|[A-Za-z_$][\w$]*\(|[A-Za-z_$][\w$]*(?:\.[\w$]+)+$)/;
const BARE_TOKEN = /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{32,}={0,2}/g;

function hasCredentialShape(title: string): boolean {
  // Ignore embedded controls for detection while keeping the displayed title whole.
  const text = title.replace(/(?!\s|\u0085)[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, "").replace(/\u0085/g, " ");
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) return true;
  for (const [, separator, value] of text.matchAll(ASSIGNED_CREDENTIAL)) {
    if (value === undefined) return true;
    if (CREDENTIAL_REFERENCE.test(value)) continue;
    if (separator === "=" || (value.length >= 8 && !/^[A-Za-z_$]+$/.test(value))) return true;
  }
  for (const [token] of text.matchAll(BARE_TOKEN)) {
    if (/^_*[A-Fa-f0-9]{32,}_*$/.test(token) || /[\d+/=]/.test(token) ||
        (/[a-z]/.test(token) && /[A-Z]/.test(token))) return true;
  }
  return false;
}

function readThread(value: unknown): ({ sid: string } & RailFields) | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const { sid, title, projectTags, lastActivityAt, openedBy, parentThreadId } = value as Record<string, unknown>;
  if (typeof sid !== "string" || !sid.trim()) return;
  if (title !== undefined && typeof title !== "string") return;
  if (lastActivityAt !== undefined && (typeof lastActivityAt !== "number" || !Number.isFinite(lastActivityAt))) return;
  if (openedBy !== undefined && typeof openedBy !== "string") return;
  if (parentThreadId !== undefined && typeof parentThreadId !== "string") return;
  if (projectTags !== undefined && !Array.isArray(projectTags)) return;
  const tags: unknown[] = Array.from(projectTags ?? []);
  if (!tags.every((tag): tag is string => typeof tag === "string")) return;

  const displayTitle = title ?? "";
  return {
    sid,
    title: hasCredentialShape(displayTitle) ? "[hidden]" : displayTitle,
    projectTags: [...new Set(tags)].sort(),
    ...(lastActivityAt === undefined ? {} : { lastActivityAt }),
    ...(openedBy === undefined ? {} : { openedBy }),
    ...(parentThreadId === undefined ? {} : { parentThreadId }),
  };
}

export function buildRailEvent(before: unknown, after: unknown): RailEvent | undefined {
  const current = readThread(after);
  if (!current) return;
  if (before === undefined || before === null) return { kind: "thread-opened", ...current };

  const previous = readThread(before);
  if (!previous || previous.sid !== current.sid) return;

  const kinds: RailChangeKind[] = [];
  const changes: Partial<RailFields> = {};
  if (current.lastActivityAt !== undefined && current.lastActivityAt > (previous.lastActivityAt ?? -Infinity)) {
    kinds.push("thread-activity");
    changes.lastActivityAt = current.lastActivityAt;
  }
  if (current.projectTags.length !== previous.projectTags.length ||
      current.projectTags.some((tag, index) => tag !== previous.projectTags[index])) {
    kinds.push("thread-tags");
    changes.projectTags = current.projectTags;
  }
  if (current.title !== previous.title) {
    kinds.push("thread-title");
    changes.title = current.title;
  }
  if (kinds.length === 0) return;
  return { kind: kinds.length === 1 ? kinds[0] : kinds, sid: current.sid, ...changes };
}
