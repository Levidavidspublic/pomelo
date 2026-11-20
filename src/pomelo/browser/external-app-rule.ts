import type { OverlayPageRead } from "./overlay-rule.js";

export type ExternalAppPageRead = Pick<OverlayPageRead, "title" | "text" | "items" | "url" | "cut">;

export interface ExternalAppRuleInput {
  readonly address?: string;
  readonly pageRead?: ExternalAppPageRead;
}

export interface ExternalAppDecision {
  action: "go" | "refuse" | "press" | "hold";
  label?: string;
  scheme?: string;
  reason: string;
  signals: string[];
}

// Treat every scheme outside the browser allowlist as unsupported, including unknown schemes.
const WEB_SCHEMES = new Set(["http:", "https:"]);
const HANDOFF_WORDING = [
  /\bopen in (?:the |your )?app(?:lication)?\b|^open (?:the )?app(?:[.!?…]|$)/,
  /^launching(?:[.!…]|$)|\blaunching (?:the |your )?app(?:lication)?\b/,
  /\bclick ["'“‘]?open["'”’]? if you see (?:the |a )?(?:system )?dialog\b/,
  /(?:לפתוח|פתח(?:ו|י)?|פתיחה) ב(?:אפליקציה|יישום)|(?:פתיחת|הפעלת|מפעיל(?:ים|ה)?|פותח(?:ים|ת)?|פתח(?:ו|י)?) (?:את )?ה(?:אפליקציה|יישום)/u,
  /(?:לח(?:ץ|צו|צי)|ללחוץ) על ["'״׳“‘]?פתח["'״׳”’]? אם [^.!?…]*(?:תיבת (?:ה)?דו[־ -]שיח|חלון (?:המערכת|דו[־ -]שיח))/u,
];
const WEB_CHOICE = [
  /^(?:continue in (?:your |the )?browser|join from (?:your |the )?browser|use (?:the )?web version|stay on (?:the )?web)$/,
  /^(?:המשך|המשיכו|המשיכי|להמשיך|המשך שימוש) בדפדפן(?: שלך)?$/u,
  /^(?:הצטרף|הצטרפו|הצטרפי|הצטרפות|להצטרף) (?:מהדפדפן|דרך הדפדפן|בדפדפן)(?: שלך)?$/u,
  /^(?:השתמש|השתמשו|השתמשי|שימוש|להשתמש) בגי?רסת (?:האינטרנט|הדפדפן|הווב|האתר)$/u,
  /^(?:הישאר|הישארו|הישארי|להישאר) (?:באתר|באינטרנט|בדפדפן|בגרסת האינטרנט)$/u,
];
const NUMBERED_ITEM = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\]|\\.)*")(?: → (.+)| = .*)?$/i;
const PRESSABLE_ROLES = new Set(["button", "link", "field:button", "field:submit"]);

function parseAddress(address: string): URL | undefined {
  try {
    return new URL(address);
  } catch {
    return undefined;
  }
}

function isBrowserAddress(url: URL): boolean {
  return WEB_SCHEMES.has(url.protocol) || url.href === "about:blank";
}

function isPageRead(value: unknown): value is ExternalAppPageRead {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { title, text, items } = value as Record<string, unknown>;
  return (title === undefined || typeof title === "string")
    && (text === undefined || typeof text === "string")
    && (items === undefined || (Array.isArray(items) && [...items].every((item) => typeof item === "string")));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\u0591-\u05bd\u05bf-\u05c2\u05c4\u05c5\u05c7\p{Cf}]/gu, "")
    .replace(/\s+/g, " ").trim();
}

function numberedItem(item: string): { role: string; label: string; destination?: string } | undefined {
  // The label's JSON string ends before any destination or field value.
  const match = NUMBERED_ITEM.exec(item);
  if (!match) return undefined;
  try {
    return { role: match[1].toLowerCase(), label: JSON.parse(match[2]) as string, destination: match[3] };
  } catch {
    return undefined;
  }
}

/** Decide from an address and masked page facts. A refused address takes precedence over page choices. */
export function externalAppRule(input?: ExternalAppRuleInput | null): ExternalAppDecision {
  const unreadable: ExternalAppDecision = { action: "hold", reason: "A readable address or masked page read is required.", signals: [] };
  const { address, pageRead } = input ?? {};
  if (address !== undefined) {
    const url = typeof address === "string" ? parseAddress(address) : undefined;
    if (!url) return unreadable;
    if (!isBrowserAddress(url)) {
      const scheme = url.protocol.slice(0, -1);
      return { action: "refuse", scheme, reason: "The address uses a scheme outside the browser allowlist.", signals: [scheme] };
    }
    if (pageRead === undefined) {
      return { action: "go", reason: "The address goes to the navigation rule.", signals: [] };
    }
  }

  if (!isPageRead(pageRead)) return unreadable;
  const { title = "", text = "", items = [] } = pageRead;
  const controls = items.map(numberedItem).filter((item) => item !== undefined);
  const wording = [title, text, ...text.split(/\r?\n/)].map(normalize).filter(Boolean);
  if (!wording.length && !controls.some(({ label }) => normalize(label))) return unreadable;
  if (!wording.some((line) => HANDOFF_WORDING.some((pattern) => pattern.test(line)))) {
    return { action: "go", reason: "No external-app prompt was found.", signals: [] };
  }

  const choices = controls.filter(({ role, label }) =>
    PRESSABLE_ROLES.has(role) && WEB_CHOICE.some((pattern) => pattern.test(normalize(label))));
  const [choice, otherChoice] = choices;
  const signals = ["External-app prompt"];
  if (choice && !otherChoice) {
    const destination = choice.destination === undefined ? undefined : parseAddress(choice.destination);
    if (choice.destination === undefined || (destination && WEB_SCHEMES.has(destination.protocol))) {
      return { action: "press", label: choice.label, reason: "The page offers one browser choice.", signals };
    }
  }
  return { action: "hold", reason: "The page has no single clear browser choice. Wait for Amit.", signals };
}
