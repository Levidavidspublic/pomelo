const MAX_NAME_LENGTH = 40;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const secretReferenceOrAssignment = /op:\/\/|(?:password|token)\s*=/i;
const tokenLikeRun = /[A-Za-z0-9_+/-]{40}/;
const emailWithPassword = /[^\s@:]@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+\s*:\s*\S/u;

function cleanText(text: string): string {
  return text
    .replace(/\p{White_Space}/gu, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu, "")
    .replace(/(^| )\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/ +/g, " ")
    .trim();
}

function clipName(text: string): string {
  let count = 0;
  for (const { index } of graphemes.segment(text)) {
    if (count === MAX_NAME_LENGTH) return text.slice(0, index).trimEnd();
    count++;
  }
  return text;
}

function caseFold(text: string): string {
  // Fold per code point so final sigma compares like sigma and sharp S expands to "ss".
  // Default Unicode folding keeps dotless i and folds Cherokee to uppercase.
  return text.replace(/./gu, (char) => {
    if (char === "ı") return char;
    if (/\p{Script=Cherokee}/u.test(char)) return char.toUpperCase();
    return char.toLowerCase().toUpperCase().toLowerCase();
  }).normalize("NFC");
}

export function cleanProfileName(raw: unknown, existingNames: readonly string[]):
  { ok: true; name: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "Use text for the profile name." };

  const text = cleanText(raw);
  if (!text) return { ok: false, reason: "Enter a profile name." };
  // Check the full cleaned input so shortening cannot expose part of a credential.
  if (secretReferenceOrAssignment.test(text) || tokenLikeRun.test(text) || emailWithPassword.test(text)) {
    return { ok: false, reason: "Choose a profile name without credentials or secret references." };
  }

  const name = clipName(text);
  const key = caseFold(name);
  if (existingNames.some((existing) => caseFold(cleanText(existing)) === key)) {
    return { ok: false, reason: "Another profile already uses that name." };
  }
  return { ok: true, name };
}
