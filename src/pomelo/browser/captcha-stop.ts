const CAPTCHA_SIGNALS = {
  widget: /(?:^|[^a-z0-9])(?:recaptcha|hcaptcha|turnstile)(?![a-z0-9])/i,
  field: /(?:^|[^a-z0-9])captcha(?![a-z0-9])/i,
  fieldItem: /^\[\d+\]\s+(?:field:\S+|select)\s+"([^"]*)"/i,
  title: /^just a moment(?:\.{3}|…)?$/i,
  url: /^https?:\/\/[^/?#]+\/cdn-cgi\/challenge-platform(?:[/?#]|$)/i,
  prompt: /^(?:(?:please\s+)?(?:verify|confirm|prove)(?:\s+that)?\s+you(?:\s+are|['’]re)\s+(?:a\s+)?human|are\s+you\s+human|i(?:\s+am|['’]m)\s+not\s+a\s+robot|(?:please\s+)?complete\s+the\s+captcha)(?:\s+to\s+(?:continue|proceed))?[.!?]?$/i,
};

type MaskedPageRead = {
  title: string;
  url: string;
  text: string;
  cut?: boolean;
  items: readonly string[];
  fields?: readonly { name?: unknown; label?: unknown }[];
};

const HOLD = Object.freeze({
  state: "waiting",
  reason: "captcha",
  allowedAnswers: Object.freeze(["handoff", "cancel"] as const),
} as const);

/** Reads an already-masked snapshot and returns the choices for a human handoff. */
export function captchaStop(page: MaskedPageRead): typeof HOLD | null {
  const { widget, field, fieldItem, title, url, prompt } = CAPTCHA_SIGNALS;
  if (title.test(page.title.trim()) || url.test(page.url)) return HOLD;

  for (const item of page.items) {
    if (widget.test(item) || field.test(fieldItem.exec(item)?.[1] ?? "")) return HOLD;
  }

  for (const { name, label } of page.fields ?? []) {
    if ([name, label].some((value) => typeof value === "string" && (field.test(value) || widget.test(value)))) return HOLD;
  }

  // Match standalone prompts so a phrase quoted in ordinary prose doesn't trigger a hold.
  if (prompt.test(page.title.trim()) || page.text.split("\n").some((line) => prompt.test(line.trim()))) return HOLD;
  return null;
}
