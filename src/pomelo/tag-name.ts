export type TagNameRefusalReason = "empty" | "not-text" | "looks-secret";

export type CleanTagNameResult =
  | { ok: true; label: string; key: string }
  | { ok: false; reason: TagNameRefusalReason };

export type MatchTagNameResult =
  | { kind: "existing"; slug: string }
  | { kind: "new"; label: string; key: string }
  | { kind: "refused"; reason: TagNameRefusalReason };

const SECRET_PREFIX = /^(?:sk-|gh[pousr]_|github_pat_|glpat-|xox[abposr]-|op:\/\/)/iu;
const TOKEN_SHAPE = /^[\p{L}\p{Nd}]{20,}$/u;

export function cleanTagName(raw: unknown): CleanTagNameResult {
  if (typeof raw !== "string") return { ok: false, reason: "not-text" };

  const text = raw
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu, "")
    .replace(/(^|\s)\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
  // The Unicode flag counts a surrogate pair as one character.
  const label = text.match(/^.{1,40}/u)?.[0].trimEnd();
  if (!label) return { ok: false, reason: "empty" };
  if (SECRET_PREFIX.test(label) || TOKEN_SHAPE.test(label)) {
    return { ok: false, reason: "looks-secret" };
  }

  return { ok: true, label, key: label.toLowerCase().replace(/[ _-]+/gu, "-") };
}

export function matchTagName(raw: unknown, existing: unknown): MatchTagNameResult {
  const cleaned = cleanTagName(raw);
  if (!cleaned.ok) return { kind: "refused", reason: cleaned.reason };

  if (Array.isArray(existing)) {
    for (const tag of existing as unknown[]) {
      if (tag === null || typeof tag !== "object" || !("slug" in tag) || !("label" in tag)) continue;
      const { slug, label } = tag;
      if (typeof slug !== "string" || typeof label !== "string") continue;

      const candidate = cleanTagName(label);
      if (candidate.ok && candidate.key === cleaned.key) return { kind: "existing", slug };
    }
  }

  return { kind: "new", label: cleaned.label, key: cleaned.key };
}
