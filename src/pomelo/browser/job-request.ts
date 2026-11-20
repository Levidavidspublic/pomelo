import { isIP } from "node:net";

export const JOB_REQUEST_GOAL_LIMIT = 2_000;
export const JOB_REQUEST_SITE_LIMIT = 20;
export const JOB_REQUEST_ID_LIMIT = 128;

export interface BrowserJobRequest {
  threadId: string;
  laneId?: string;
  profileId: string;
  goal: string;
  sites: string[];
}

export type JobRequestCheck = { ok: true; request: BrowserJobRequest } | { ok: false; reasons: string[] };
export type JobRequestHide = (text: string) => { text: string; hidden: number };

const SECRET_FIELDS = new Set(["password", "secret", "token", "otp", "cookie"]);
const BROKER_REASON = "a secret must be filled by reference through the 1Password broker";
const MASK = "[secret hidden]";
const MASKED_ID = "_redacted_";
const MASKED_ORIGIN = "https://redacted.invalid";
const UNSAFE_ID_CHAR = /[^A-Za-z0-9_-]/;
const GOAL_CONTROLS = /[\p{Cc}\p{Cs}\p{Bidi_Control}\u00AD\u200B\u2060\u206A-\u206F\uFEFF]/gu;
const VAULT_REFERENCE = /op:\/\//i;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const INVALID_SITE = "Enter a valid site address.";
const DOMAIN_LABEL = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/;

function ownValue(object: object, key: PropertyKey): unknown {
  return Object.getOwnPropertyDescriptor(object, key)?.value;
}

function hasSecretField(input: object): boolean {
  const pending: object[] = [input];
  const seen = new WeakSet<object>(pending);
  while (pending.length) {
    const object = pending.pop()!;
    for (const key of Reflect.ownKeys(object)) {
      if (typeof key === "string" && SECRET_FIELDS.has(key.toLowerCase())) return true;
      const value = ownValue(object, key);
      if (value !== null && typeof value === "object" && !seen.has(value)) {
        seen.add(value);
        pending.push(value);
      }
    }
  }
  return false;
}

function cleanId(value: unknown, hide: JobRequestHide): string | undefined {
  if (typeof value !== "string") return;
  if (VAULT_REFERENCE.test(value) || hide(value).hidden > 0) return MASKED_ID;
  if (value.length && value.length <= JOB_REQUEST_ID_LIMIT && !UNSAFE_ID_CHAR.test(value)) return value;
}

function cleanGoal(value: unknown, hide: JobRequestHide): string {
  if (typeof value !== "string") return "";
  const text = value.replace(GOAL_CONTROLS, "").trim();
  if (!text) return "";

  const withoutReferences = text
    .replace(/(["'`])op:\/\/[^]*?\1/gi, (_path, quote: string) => `${quote}${MASK}${quote}`)
    // A slash can delimit a vault or item name with spaces even when the reference is unquoted.
    .replace(/op:\/\/(?:[^/:\s<>"'`()\[\]{},;]+(?: +[^/:\s<>"'`()\[\]{},;]+)*\/){0,3}[^\s<>"'`()\[\]{},;]*/gi, MASK);
  const masked = hide(withoutReferences);
  const goal = masked.text.trim() || (masked.hidden > 0 ? MASK : "");
  if (goal.length <= JOB_REQUEST_GOAL_LIMIT) return goal;

  // The length budget is in UTF-16 units. Cut before the first grapheme that would cross it.
  for (const { index, segment } of GRAPHEMES.segment(goal)) {
    if (index + segment.length > JOB_REQUEST_GOAL_LIMIT) return goal.slice(0, index).trimEnd();
  }
  return goal;
}

function cleanSite(value: unknown, hide: JobRequestHide): { origin: string } | { reason: string } {
  if (typeof value !== "string") return { reason: INVALID_SITE };
  const text = value.trim();
  const scheme = /^[a-z][a-z\d+.-]*:/i.exec(text)?.[0].toLowerCase();
  const prefix = scheme ? `${scheme}//` : "";
  if (scheme && !text.toLowerCase().startsWith(prefix)) return { reason: INVALID_SITE };
  const authority = text.slice(prefix.length).split(/[/?#\\]/, 1)[0];
  if (!authority || /\s|\p{Cc}|\p{Bidi_Control}/u.test(authority)) return { reason: INVALID_SITE };

  let url: URL;
  try {
    url = new URL(scheme ? text : `https://${text}`);
  } catch {
    return { reason: INVALID_SITE };
  }

  const host = url.hostname.toLowerCase();
  const domain = host.replace(/\.$/, "");
  const ip = isIP(domain.replace(/^\[|\]$/g, ""));
  const validName = domain.length <= 253 && domain.split(".").every((label) => DOMAIN_LABEL.test(label));
  if (host.includes("*") || /\*|%2a/i.test(url.pathname)) return { reason: "Use individual sites without wildcards." };
  if (!ip && !validName) return { reason: INVALID_SITE };

  // Check the original hostname too, before the URL parser folds its case.
  const rawHost = authority.slice(authority.lastIndexOf("@") + 1).replace(/:\d+$/, "");
  const masked = scheme === "op:" || hide(rawHost).hidden > 0 || hide(host).hidden > 0;
  const forHost = masked ? "" : ` for ${host}`;
  if (authority.includes("@")) return { reason: `Remove user info from the address${forHost}.` };
  if (url.protocol !== "https:") return { reason: `Use HTTPS${forHost}.` };
  if (ip) return { reason: `Use a domain name${forHost}.` };
  if (domain === "localhost" || domain.endsWith(".localhost")) return { reason: `Use a public hostname${forHost}.` };
  return { origin: masked ? MASKED_ORIGIN : url.origin };
}

/** Check agent arguments before passing a cleaned copy to the browser job caller. */
export function checkJobRequest(input: unknown, hide: JobRequestHide): JobRequestCheck {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reasons: ["Provide a browser job request object."] };
  }
  if (hasSecretField(input)) return { ok: false, reasons: [BROKER_REASON] };

  const reasons: string[] = [];
  const threadId = cleanId(ownValue(input, "threadId"), hide);
  const rawLaneId = ownValue(input, "laneId");
  const laneId = cleanId(rawLaneId, hide);
  const profileId = cleanId(ownValue(input, "profileId"), hide);
  if (threadId === undefined) reasons.push("Provide a valid threadId.");
  if (rawLaneId !== undefined && laneId === undefined) reasons.push("Provide a valid laneId.");
  if (profileId === undefined) reasons.push("Provide a valid profileId.");

  const goal = cleanGoal(ownValue(input, "goal"), hide);
  if (!goal) reasons.push("Enter a browser job goal.");

  const rawSites = ownValue(input, "sites");
  const sites = new Set<string>();
  if (!Array.isArray(rawSites)) reasons.push("Provide a list of sites.");
  else if (!rawSites.length) reasons.push("Provide at least one site.");
  else if (rawSites.length > JOB_REQUEST_SITE_LIMIT) reasons.push(`Provide at most ${JOB_REQUEST_SITE_LIMIT} sites.`);
  else {
    for (let index = 0; index < rawSites.length; index++) {
      const site = cleanSite(ownValue(rawSites, index), hide);
      if ("reason" in site) reasons.push(site.reason);
      else sites.add(site.origin);
    }
  }

  if (reasons.length || threadId === undefined || profileId === undefined) return { ok: false, reasons };
  return { ok: true, request: { threadId, ...(laneId === undefined ? {} : { laneId }), profileId, goal, sites: [...sites] } };
}
