import { createHash } from "node:crypto";
import { toUSVString } from "node:util";
import { HIDDEN } from "../../secrets.js";
import { MASK, maskText } from "../mask.js";

const DEFAULT_NAME = "Browser skill";
const MAX_NAME_LENGTH = 60;
const MAX_SLUG_LENGTH = 40;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const windowsDevice = /^(?:con|prn|aux|nul|conin|conout|(?:com|lpt)[1-9])$/;

function stripMarkup(text: string): string {
  return text
    .replace(/<!--[\s\S]*?(?:-->|$)|<\/?[a-z][\w:-]*(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/gi, "")
    .replace(/!?\[([^\[\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}\s+|>\s*)/, "")
    .replace(/(\*{1,3}|~~)(?=\S)([^*~]*?\S)\1/g, "$2")
    .replace(/(?<![\p{L}\p{N}_])(_{1,3})(?=\S)([^_]*?\S)\1(?![\p{L}\p{N}_])/gu, "$2");
}

function maskName(text: string): string {
  // The shared shield handles recognizable credentials. Labels also treat short and quoted values as sensitive.
  const paths = text
    .replace(/(["'`])op:\/\/[^\r\n]*?\1/gi, MASK)
    .replace(/\bop:\/\/[^\s<>"'`]*/gi, MASK);
  const assigned = paths.replace(
    /((?<![a-z0-9])(?:password|passwd|passphrase|token|secret|(?:api|access|auth|private)[ _-]?key|key)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|`[^`]*(?:`|$)|\S+)/gi,
    `$1${MASK}`,
  );
  return maskText(assigned, [])
    // Friday keeps a recognizable prefix for logs. The display name uses a single mask for the whole credential.
    .replace(`-----BEGIN PRIVATE KEY----- ${HIDDEN} -----END PRIVATE KEY-----`, MASK)
    .replace(/[a-z0-9_./-]+…(?=\[secret hidden\])/gi, "")
    .replaceAll(HIDDEN, MASK);
}

function clipName(name: string): string {
  let count = 0;
  for (const { index } of graphemes.segment(name)) {
    if (count === MAX_NAME_LENGTH) return name.slice(0, index).trimEnd();
    count++;
  }
  return name;
}

function usedSlugs(existing: Iterable<unknown> | null): Set<string> {
  const slugs = new Set<string>();
  try {
    if (existing && typeof existing !== "string") {
      for (const slug of existing) {
        if (typeof slug === "string") slugs.add(slug.toLowerCase());
      }
    }
  } catch {
    // Keep any entries read before a malformed iterable failed.
  }
  return slugs;
}

/** Derive a display label and a slug against the caller's snapshot of existing skills. */
export function browserSkillName(raw: unknown, existingSlugs: Iterable<unknown> | null = []) {
  const reasons: string[] = [];
  const input = typeof raw === "string" ? raw : "";
  const text = toUSVString(input)
    .replace(/[\p{Cc}\p{Bidi_Control}\u200B\u2060]/gu, (char) => /[\s\u0085]/u.test(char) ? " " : "");
  const unmarked = stripMarkup(text);
  const masked = maskName(unmarked);
  const plain = masked.replaceAll("`", "");
  // Removing inline code delimiters can join fragments of a recognizable token.
  const safe = plain === masked ? masked : maskName(plain);
  const line = safe.replace(/\s+/g, " ").trim();
  const name = clipName(line) || DEFAULT_NAME;

  if (text !== input || line !== safe) reasons.push("cleaned");
  if (unmarked !== text || plain !== masked) reasons.push("stripped-markup");
  if (masked !== unmarked || safe !== plain) reasons.push("masked-secret");
  if (!line) reasons.push("default-name");
  else if (name !== line) reasons.push("shortened-name");

  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!base) {
    base = `skill-${createHash("sha256").update(name).digest("hex").slice(0, 10)}`;
    reasons.push("hashed-slug");
  } else if (windowsDevice.test(base)) {
    base = `skill-${base}`;
    reasons.push("reserved-slug");
  }
  base = base.slice(0, MAX_SLUG_LENGTH).replace(/-$/, "");

  const taken = usedSlugs(existingSlugs);
  let slug = base;
  for (let number = 2; taken.has(slug); number++) {
    const suffix = `-${number}`;
    slug = base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-$/, "") + suffix;
  }
  if (slug !== base) reasons.push("slug-clash");
  return { name, slug, changed: reasons.length > 0, reasons };
}
