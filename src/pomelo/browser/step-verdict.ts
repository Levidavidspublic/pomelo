const STRICTNESS = { go: 0, wait: 1, hold: 2, refuse: 3 } as const;

type Verdict = keyof typeof STRICTNESS;

export interface StepAnswer {
  /** A fixed rule name supplied by the caller. */
  rule: string;
  answer: Verdict;
  reasonCode?: string;
  waitMs?: number;
}

export interface StepVerdict {
  verdict: Verdict;
  decidedBy: string[];
  missing: string[];
  waitMs?: number;
  message: string;
}

function verdictMessage(verdict: Verdict, decidedBy: readonly string[], missing: readonly string[]): string {
  const rules = decidedBy.join(", ");
  switch (verdict) {
    case "go":
      return `The step can continue because ${rules} cleared it.`;
    case "wait":
      return `The step is waiting on ${rules}.`;
    case "refuse":
      return `The step was refused by ${rules}.`;
    case "hold": {
      const reasons = decidedBy.length > 0 ? [rules] : [];
      if (missing.length > 0) reasons.push(`missing answers from ${missing.join(", ")}`);
      if (reasons.length === 0) return "The step is held for you because no checks answered.";
      return `The step is held for you because of ${reasons.join(" and ")}.`;
    }
  }
}

/** Join stop-rule answers for one step. Only fixed rule names appear in the message. */
export function stepVerdict(answers: readonly StepAnswer[], required: readonly string[]): StepVerdict {
  const answerByRule = new Map<string, Verdict>();
  let longestWait: number | undefined;

  for (const { rule, answer: rawAnswer, waitMs } of answers) {
    const answer = typeof rawAnswer === "string" && Object.hasOwn(STRICTNESS, rawAnswer) ? rawAnswer : "hold";
    const previous = answerByRule.get(rule);
    if (previous === undefined || STRICTNESS[answer] > STRICTNESS[previous]) {
      answerByRule.set(rule, answer);
    }
    if (answer === "wait" && typeof waitMs === "number" && Number.isFinite(waitMs) && waitMs >= 0) {
      longestWait = Math.max(longestWait ?? 0, waitMs);
    }
  }

  const missing = [...new Set(required)].filter((rule) => !answerByRule.has(rule)).sort();
  let verdict: Verdict = answerByRule.size === 0 || missing.length > 0 ? "hold" : "go";
  let decidedBy: string[] = [];
  for (const [rule, answer] of answerByRule) {
    if (STRICTNESS[answer] > STRICTNESS[verdict]) {
      verdict = answer;
      decidedBy = [];
    }
    if (answer === verdict) decidedBy.push(rule);
  }
  decidedBy.sort();

  const result: StepVerdict = { verdict, decidedBy, missing, message: verdictMessage(verdict, decidedBy, missing) };
  if (verdict === "wait" && longestWait !== undefined) result.waitMs = Math.min(longestWait, 60_000);
  return result;
}
