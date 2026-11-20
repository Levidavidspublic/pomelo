import { HIDDEN } from "../../secrets.js";
import { MASK } from "../mask.js";

type PageLabel = string | { readonly label: string };

export interface PaywallPageRead {
  readonly title?: string;
  readonly text?: string;
  readonly headings?: readonly PageLabel[];
  readonly buttons?: readonly PageLabel[];
  readonly links?: readonly PageLabel[];
  readonly fields?: readonly { readonly label?: string; readonly value?: unknown }[];
  /** Friday's numbered controls, which can include a separate link target or field value. */
  readonly items?: readonly string[];
}

export type PaywallKind = "metered" | "subscribe" | "trial" | "sign-in-to-read";

export interface PaywallDecision {
  decision: "go-on" | "report-partial" | "hold";
  kind?: PaywallKind;
  reason: string;
  forbidden: string[];
}

// Order matters when a wall offers several ways to continue reading.
const WALL_PHRASES: readonly (readonly [PaywallKind, readonly RegExp[]])[] = Object.freeze([
  ["metered", Object.freeze([
    /^you(?: have|'ve) (?:already )?(?:read|used(?: up)?|exhausted) (?:all (?:of )?)?(?:(?:your|the) )?(?:\d+ )?free articles?\b/,
    /^you(?: have|'ve) reached (?:your|the) (?:monthly )?(?:(?:free )?article (?:limit|quota)|(?:limit|quota) (?:of|for) (?:\d+ )?free articles?)\b/,
    /^(?:מיצית|ניצלת|סיימת|קראת)(?:ם|ן)? (?:את )?(?:כל |מכסת )?(?:\d+ )?ה?(?:כתבות|מאמרים) ה?(?:חינמיות|חינמיים|חינם)/u,
    /^(?:הגעת(?:ם|ן)? ל|תמה |נגמרה )(?:מכסת|מגבלת) ה?(?:כתבות|מאמרים)/u,
  ])],
  ["sign-in-to-read", Object.freeze([
    /^(?:please )?(?:sign|log)[ -]?in to (?:(?:keep|continue) reading|read (?:the (?:rest|full article)|this article))\b/,
    /^(?:כדי להמשיך לקרוא[, ]+)?(?:יש להתחבר|התחבר(?:ו|י)?|היכנס(?:ו|י)?|כניסה לחשבון) (?:כדי להמשיך לקרוא|להמשך קריאה|כדי לקרוא (?:את )?(?:הכתבה|המאמר))/u,
    /^כדי להמשיך לקרוא[, ]+(?:יש להתחבר|התחברו|היכנסו)/u,
  ])],
  ["trial", Object.freeze([
    /^(?:please )?start (?:a |your )?free trial to (?:continue|keep reading|read (?:the full article|this article))\b/,
    /^(?:התחל|התחילו|התחילי|נסו|פתחו) (?:את )?(?:תקופת |חודש )?ה?ניסיון (?:חינם|בחינם|ללא תשלום) (?:כדי להמשיך|להמשך קריאה)/u,
  ])],
  ["subscribe", Object.freeze([
    /^(?:please )?subscribe to (?:(?:keep|continue) reading|read (?:the (?:rest|full article)|this article)|unlock (?:the|this) article)\b/,
    /^to (?:keep|continue) reading,? (?:please )?subscribe\b/,
    /^(?:(?:this (?:article|story)|the (?:full article|rest of this article)) is (?:only )?(?:available to |for )?)?(?:paid )?(?:subscribers|members) only\b/,
    /^this (?:article|story) is (?:only available to|for) (?:paid )?subscribers\b/,
    /^(?:(?:עשו|עשה|עשי|רכשו|רכשי|קנו|יש לרכוש) מנוי|הצטרפו למנוי|הירשמו כמנויים) (?:כדי להמשיך לקרוא|להמשך קריאה|כדי לקרוא)/u,
    /^(?:להמשך קריאה|כדי להמשיך לקרוא)[, ]+(?:יש לרכוש מנוי|רכשו מנוי|עשו מנוי|הצטרפו כמנויים)/u,
    /^(?:הכתבה|המאמר|התוכן) (?:הזו |הזה )?(?:זמינ(?:ה|ים)? |פתוח(?:ה)? )?למנויים בלבד/u,
  ])],
]);

const PAYMENT_BUTTONS = Object.freeze([
  /^subscribe\b(?![^.!?]*\bnewsletter\b)(?![^.!?]*\b(?:podcast|notifications|updates)\b)/,
  /^(?:start (?:a |your |my )?(?:free )?trial|buy|upgrade|continue with (?:a |your )?(?:(?:credit|debit) )?card)\b/,
  /^(?:(?:עשו|עשה|עשי|רכשו|רכשי|קנו) מנוי|הצטרפו למנוי|(?:התחל|התחילו|התחילי) (?:את )?(?:תקופת )?ה?ניסיון|(?:קנה|קני|קנו|קנייה|רכישה|שדרג|שדרגו|שדרוג)|(?:המשך|המשיכו|המשיכי) (?:עם |ב)כרטיס)(?!\p{L})/u,
]);
const NUMBERED_CONTROL = /^\[\d+\]\s+(button|link|field:submit|field:button)\s+("(?:[^"\\]|\\.)*")(?=$| [→=] )/i;
const WALL_COPY = Object.freeze([
  /\b(?:unlimited access|full access|free trial|already a (?:subscriber|member)|subscribe|subscription|sign in|credit card|all rights reserved)\b/,
  /^(?:please )?(?:enter|provide|confirm|add) (?:a |your )?(?:email|payment|card|password)\b/,
  /גישה (?:מלאה|ללא הגבלה)|מנוי|תקופת ה?ניסיון|כל הזכויות שמורות|^(?:הזינו|הקלידו) (?:את )?(?:כתובת|סיסמה)/u,
]);

function normalize(text: string): string {
  return text.replaceAll(MASK, " ").replaceAll(HIDDEN, " ")
    .normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase().replace(/’/g, "'")
    .replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function labels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item === "string") return [item];
    return isRecord(item) && typeof item.label === "string" ? [item.label] : [];
  });
}

function numberedControls(items: unknown): { role: string; label: string }[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: unknown) => {
    if (typeof item !== "string") return [];
    const match = NUMBERED_CONTROL.exec(item);
    if (!match) return [];
    try {
      return [{ role: match[1].toLowerCase(), label: JSON.parse(match[2]) as string }];
    } catch {
      return [];
    }
  });
}

function unreadable(forbidden: string[] = []): PaywallDecision {
  return { decision: "hold", reason: "The masked page read is missing or unreadable. Wait for Amit to check the page.", forbidden };
}

function wallKind(text: string): PaywallKind | undefined {
  return WALL_PHRASES.find(([, phrases]) => phrases.some((phrase) => phrase.test(text)))?.[0];
}

function hasPreview(lines: readonly string[], pageLabels: ReadonlySet<string>): boolean {
  // Flat reads lack paragraph roles. Recognize body prose by length or multiple short sentences.
  let shortSentences = 0;
  for (const line of lines) {
    if (pageLabels.has(line.replace(/[.!?…:]+$/, "")) || WALL_COPY.some((phrase) => phrase.test(line))) continue;
    const words = line.match(/\p{L}+/gu)?.length ?? 0;
    if (words >= 12) return true;
    if (words < 4 || !/[.!?…]$/.test(line)) continue;
    shortSentences++;
    if (words >= 8 || shortSentences >= 2) return true;
  }
  return false;
}

/** Classify a masked read for the browser job without taking any action on the page. */
export function paywallStop(pageRead?: unknown): PaywallDecision {
  if (!isRecord(pageRead)) return unreadable();

  const controls = numberedControls(pageRead.items);
  const buttons = [...labels(pageRead.buttons), ...controls.filter(({ role }) =>
    role === "button" || role === "field:submit" || role === "field:button").map(({ label }) => label)];
  const forbidden = new Map<string, string>();
  for (const label of buttons) {
    const key = normalize(label);
    if (!forbidden.has(key) && PAYMENT_BUTTONS.some((phrase) => phrase.test(key))) {
      forbidden.set(key, label.replaceAll(MASK, "").replaceAll(HIDDEN, "").trim());
    }
  }
  const blockedButtons = [...forbidden.values()];

  const { title = "", text = "" } = pageRead;
  if (typeof title !== "string" || typeof text !== "string") return unreadable(blockedButtons);
  const headings = [title, ...labels(pageRead.headings)];
  const links = [...labels(pageRead.links), ...controls.filter(({ role }) => role === "link").map(({ label }) => label)];
  const body = text.split(/\r?\n|(?<=[.!?…])\s+/u).map(normalize).filter(Boolean);
  const visibleLabels = [...headings, ...buttons, ...links].map(normalize);
  if (body.length === 0 && !visibleLabels.some(Boolean)) return unreadable(blockedButtons);

  const bodyKinds = body.map((line, index) => wallKind(line)
    ?? wallKind([line, body[index + 1]].join(" ")));
  const detectedKinds = new Set([...bodyKinds, ...visibleLabels.map(wallKind)]);
  const kind = WALL_PHRASES.find(([candidate]) => detectedKinds.has(candidate))?.[0];
  if (!kind) return { decision: "go-on", reason: "No paywall prompt was found.", forbidden: blockedButtons };

  const wallStart = bodyKinds.findIndex(Boolean);
  const pageLabels = new Set([...visibleLabels, ...labels(pageRead.fields).map(normalize)].map((label) =>
    label.replace(/[.!?…:]+$/, "")));
  // Only body text before the first visible wall prompt can count as a preview.
  const beforeWall = wallStart < 0 ? body : body.slice(0, wallStart);
  if (hasPreview(beforeWall, pageLabels)) {
    return {
      decision: "report-partial", kind,
      reason: "A preview is readable. Report the preview and say that the rest is behind a paywall.",
      forbidden: blockedButtons,
    };
  }
  return {
    decision: "hold", kind,
    reason: "A paywall blocks the article. Wait for Amit to check the page.",
    forbidden: blockedButtons,
  };
}
