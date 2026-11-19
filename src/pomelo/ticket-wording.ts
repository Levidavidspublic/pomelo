export interface TicketWordingOptions {
  tiers?: readonly string[];
  trustLevels?: readonly string[];
}

export interface TicketWordingHit {
  /** The 1-based source line, or 0 for a ticket-wide diagnostic. */
  line: number;
  /** The name as written, or an empty string for a ticket-wide diagnostic. */
  word: string;
  reason: "model-name" | "missing-tier" | "missing-trust" | "empty";
}

export interface TicketWordingResult {
  ok: boolean;
  hits: TicketWordingHit[];
}

const driverNames = Object.freeze(["Claude Code", "Codex", "OpenCode"]);
// Keep longer names before their prefixes so "Codex GPT" is reported as one name.
const modelNames = Object.freeze([
  "Codex GPT", "Opus", "Sonnet", "Haiku", "Fable", "GPT", "ChatGPT", "Gemini",
  "GLM", "DeepSeek", "Qwen", "Kimi", "Grok", "Llama", "Mistral", "Mixtral",
  ...driverNames, "Claude",
]);
const defaultTiers = Object.freeze(["low", "mid", "high"]);
const defaultTrustLevels = Object.freeze(["trusted", "untrusted"]);

function wordPattern(words: readonly string[], flags: string, suffix = ""): RegExp {
  const alternatives = words.filter(Boolean).map((word) => word.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&"));
  return new RegExp(
    alternatives.length ? String.raw`(?<![\p{L}\p{N}_])(${alternatives.join("|")})${suffix}(?![\p{L}\p{N}_])` : "(?!)",
    flags,
  );
}

const modelPattern = wordPattern(modelNames, "giu", String.raw`(?:v?\d+[a-z]?)?`);
const builderField = /\b(?:model|builder|worker|build agent|code agent|assigned to)[\s*_]*:[\s`*_]*(?:the[\s`*_]+)?$/i;
const builderInstruction = /\b(?:build|implement|write|code|complete|do|run)\s+(?:(?:this|the)\s+(?:(?:ticket|task|change|patch|feature)\s+)?)?(?:with|using|on)\s+(?:the\s+)?[`*_]*$/i;
const ticketWork = /^[\s`*_]*(?:driver\s+)?(?:(?:will|should|must|can|to)\s+)?(?:build|implement|write|code|complete|do|run|for)\s+(?:this|the)\s+(?:ticket|task|change|patch)\b/i;
const chooseDriver = /\b(?:use|choose|pick|assign)\s+(?:the\s+)?[`*_]*$/i;
const endOfChoice = /^[\s`*_]*(?:driver\b)?[\s`*_.!]*$/i;

/** Check the ticket's prose for named models and routing words. */
export function checkTicketWording(ticketText: unknown, opts: TicketWordingOptions = {}): TicketWordingResult {
  if (typeof ticketText !== "string" || !ticketText.trim()) {
    return { ok: false, hits: [{ line: 0, word: "", reason: "empty" }] };
  }

  const hits: TicketWordingHit[] = [];
  const tiers = wordPattern(opts.tiers ?? defaultTiers, "iu");
  const trustLevels = wordPattern(opts.trustLevels ?? defaultTrustLevels, "iu");
  let hasTier = false;
  let hasTrust = false;
  let fence: string | undefined;

  for (const [index, line] of ticketText.split(/\r\n?|\n/).entries()) {
    const delimiter = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const closing = delimiter?.[1];
      if (closing && closing[0] === fence[0] && closing.length >= fence.length && !delimiter?.[2]?.trim()) {
        fence = undefined;
      }
      continue;
    }
    if (delimiter?.[1] && !(delimiter[1][0] === "`" && delimiter[2]?.includes("`"))) {
      fence = delimiter[1];
      continue;
    }

    hasTier ||= tiers.test(line);
    hasTrust ||= trustLevels.test(line);
    for (const match of line.matchAll(modelPattern)) {
      const [name, word] = match;
      if (!word) continue;
      // Driver names can describe a product feature. Model names on the same line still count.
      if (name === word && driverNames.some((driver) => driver.toLowerCase() === word.toLowerCase())) {
        const before = line.slice(0, match.index);
        const after = line.slice(match.index + word.length);
        const namesBuilder = builderField.test(before) || builderInstruction.test(before) || ticketWork.test(after)
          || (chooseDriver.test(before) && endOfChoice.test(after));
        if (!namesBuilder) continue;
      }
      hits.push({ line: index + 1, word, reason: "model-name" });
      break;
    }
  }

  if (!hasTier) hits.push({ line: 0, word: "", reason: "missing-tier" });
  if (!hasTrust) hits.push({ line: 0, word: "", reason: "missing-trust" });
  return { ok: hits.length === 0, hits };
}
