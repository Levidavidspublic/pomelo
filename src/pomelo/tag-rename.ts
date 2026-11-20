interface ProjectTag {
  slug: string;
  label: string;
  colour?: string;
  createdBy: string;
}

export const TAG_LABEL_LIMIT = 64;

type RenameTagResult =
  | { ok: true; tag: ProjectTag }
  | { ok: false; reason: "unknown-tag" | "empty-label" | "too-long" | "taken" };

function cleanLabel(label: string): string {
  return label
    .replace(/\p{Cc}/gu, (character) => /\p{White_Space}/u.test(character) ? " " : "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFC");
}

function labelKey(cleanedLabel: string): string {
  return cleanedLabel.toLocaleLowerCase("en").normalize("NFC");
}

export function renameTag(tags: readonly ProjectTag[], slug: string, newLabel: string): RenameTagResult {
  const tag = tags.find((candidate) => candidate.slug === slug);
  if (!tag) return { ok: false, reason: "unknown-tag" };

  const label = cleanLabel(newLabel);
  if (!label) return { ok: false, reason: "empty-label" };
  if ([...label].length > TAG_LABEL_LIMIT) return { ok: false, reason: "too-long" };

  const key = labelKey(label);
  if (tags.some((candidate) => candidate.slug !== slug && labelKey(cleanLabel(candidate.label)) === key)) {
    return { ok: false, reason: "taken" };
  }

  return { ok: true, tag: { ...tag, label } };
}
