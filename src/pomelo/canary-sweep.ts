import { toUSVString } from "node:util";

/** Build search needles for a synthetic canary. These contain canary text. */
export function canaryForms(canary: string): { form: string; needle: string }[] {
  if (Array.from(canary).length < 8) {
    throw new Error("Canary must be at least 8 characters");
  }

  const bytes = Buffer.from(canary, "utf8");
  const hex = bytes.toString("hex");
  const forms = new Map<string, string>();
  const add = (form: string, needle: string) => {
    if (!forms.has(needle)) forms.set(needle, form);
  };

  add("plain", canary);
  add("json", JSON.stringify(canary).slice(1, -1));
  add("url", encodeURIComponent(toUSVString(canary)));
  add("hex", hex);
  add("hex", hex.toUpperCase());

  for (let prefixBytes = 0; prefixBytes < 3; prefixBytes++) {
    const aligned = Buffer.alloc(prefixBytes + bytes.length);
    bytes.copy(aligned, prefixBytes);

    // Keep only six-bit characters whose bits all come from the canary.
    // Prefix bytes set the alignment. Their values, suffix bytes and padding cannot affect the needle.
    const start = Math.ceil((prefixBytes * 8) / 6);
    const end = Math.floor((aligned.length * 8) / 6);
    add("base64", aligned.toString("base64").slice(start, end));
    add("base64url", aligned.toString("base64url").slice(start, end));
  }

  return Array.from(forms, ([needle, form]) => ({ form, needle }));
}

/** Report matches at zero-based offsets in the original source string. */
export function sweepForCanary(canary: string, sources: Record<string, string>): { source: string; form: string; at: number }[] {
  const forms = canaryForms(canary);
  const hits: { source: string; form: string; at: number }[] = [];
  for (const [name, text] of Object.entries(sources)) {
    const source = forms.some(({ needle }) => name.includes(needle)) ? "…" : name;
    for (const { form, needle } of forms) {
      for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
        hits.push({ source, form, at });
      }
    }
  }
  return hits;
}

export function assertNoCanary(canary: string, sources: Record<string, string>): void {
  const hits = sweepForCanary(canary, sources);
  if (hits.length > 0) {
    const locations = new Set(hits.map(({ source, form }) => `${source} (${form})`));
    throw new Error([...locations].join("\n"));
  }
}
