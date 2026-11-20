import { hideSecrets } from "../../secrets.js";

type RecordFields = Record<string, unknown>;

const rowStates = {
  reachable: { label: "Reachable", action: "none" },
  slow: { label: "Slow", action: "none" },
  unreachable: { label: "VPS not reachable", action: "retry" },
  "needs-fixing": { label: "Needs fixing", action: "none" },
} as const;

type CloudStatus = keyof typeof rowStates;
type CloudRow = {
  name: string;
  cdpUrlName: string | null;
  badge: "VPS";
  status: CloudStatus;
  label: string;
  lastSeen: string;
  action: "none" | "retry";
};

type CloudSection = {
  title: "Cloud browser";
  status: "not-set-up" | "set-up" | "needs-fixing";
  nextStep: string | null;
  rows: CloudRow[];
};

// Match the name accepted by the server-side CDP resolver.
const environmentName = /^POMELO_[A-Z0-9_]+$/;
const profileName = /^\p{L}[\p{L}\p{M}\p{Nd} '’׳״־-]*$/u;
const addressOrCredential = /[.:/\\?#[\]@=%&\p{C}]|^\s*\d+\s*$|\blocalhost\b|\bport +\d+\b|\bbearer +/iu;
const opaqueToken = /(?:^| )(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}(?= |$)/;
const connectionFields = new Set(["url", "cdpUrl", "host", "hostname", "port", "cdpPort", "address", "endpoint", "token"]);

function isRecord(value: unknown): value is RecordFields {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unsafeText(value: string): boolean {
  return addressOrCredential.test(value) || hideSecrets(value).hidden > 0;
}

function hasUnsafeFields(record: RecordFields): boolean {
  // Profile records and reach reports contain only scalar metadata.
  return Object.entries(record).some(([key, value]) => {
    if (value == null) return false;
    if (connectionFields.has(key) || typeof value === "object") return true;
    if (typeof value !== "string") return false;
    return unsafeText(value) || (key !== "id" && key !== "cdpUrlName" && opaqueToken.test(value));
  });
}

const relativeTime = new Intl.RelativeTimeFormat("en");
const ageUnits = [["day", 86_400], ["hour", 3_600], ["minute", 60], ["second", 1]] as const;

function lastSeenLabel(lastOkAt: unknown, now: number): string {
  if (typeof lastOkAt !== "number" || !Number.isFinite(now)) return "Never seen";
  const age = (now - lastOkAt) / 1_000;
  if (!Number.isFinite(age) || age < 0) return "Never seen";

  for (const [unit, seconds] of ageUnits) {
    if (age >= seconds) return "Last seen " + relativeTime.format(-Math.floor(age / seconds), unit);
  }
  return "Last seen just now";
}

function cloudRow(profile: RecordFields, reports: RecordFields, now: number): CloudRow {
  const { id, name, cdpUrlName } = profile;
  const report = typeof id === "string" && Object.hasOwn(reports, id) ? reports[id] : undefined;
  const reach = isRecord(report) ? report : {};
  // These are the state and last successful heartbeat from the server reach report.
  const state = report === undefined ? "unreachable" : reach.state;
  const safeName = typeof name === "string" && profileName.test(name) && !unsafeText(name) && !opaqueToken.test(name);
  const safeEnv = typeof cdpUrlName === "string" && environmentName.test(cdpUrlName) && !unsafeText(cdpUrlName);
  const validState = state === "reachable" || state === "slow" || state === "unreachable";
  const status = safeName && safeEnv && validState && !hasUnsafeFields(profile) && !hasUnsafeFields(reach)
    ? state
    : "needs-fixing";

  return {
    name: safeName ? name : "Cloud browser profile",
    cdpUrlName: safeEnv ? cdpUrlName : null,
    badge: "VPS",
    status,
    ...rowStates[status],
    lastSeen: lastSeenLabel(reach.lastOkAt, now),
  };
}

export function cloudSettings({ profiles, reachByProfileId, now }: {
  profiles: unknown;
  reachByProfileId?: unknown;
  now: number;
}): CloudSection {
  const reports = isRecord(reachByProfileId) ? reachByProfileId : {};
  const rows: CloudRow[] = [];
  if (Array.isArray(profiles)) {
    for (const profile of profiles) {
      if (isRecord(profile) && profile.location === "cloud") rows.push(cloudRow(profile, reports, now));
    }
  }
  if (rows.length === 0) {
    return {
      title: "Cloud browser",
      status: "not-set-up",
      nextStep: "Add a cloud browser profile with a Pomelo environment variable name.",
      rows,
    };
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "en") || (a.cdpUrlName ?? "").localeCompare(b.cdpUrlName ?? "", "en"));
  return {
    title: "Cloud browser",
    status: rows.some(({ status }) => status !== "needs-fixing") ? "set-up" : "needs-fixing",
    nextStep: null,
    rows,
  };
}
