export interface GuardAnswer {
  /** A configured guard name. */
  name: string;
  ran: boolean;
  verdict: "ok" | "hold" | "stop";
  findings: number;
}

export interface PrVerdictInput {
  required: readonly string[];
  answers: readonly GuardAnswer[];
}

interface GuardReason {
  name?: string;
  reason: string;
  findings?: number;
}

export interface PrVerdictResult {
  verdict: "merge" | "hold" | "stop";
  reasons: GuardReason[];
}

interface ReportedAnswer {
  ran: unknown;
  verdict: unknown;
  findings: unknown;
  conflicting: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGuardName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/[\p{Cc}\p{Bidi_Control}\u2028\u2029]/u.test(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function prGuardVerdict(input: unknown): PrVerdictResult {
  if (!isRecord(input) || !Array.isArray(input.required) || !Array.isArray(input.answers)) {
    return { verdict: "stop", reasons: [{ reason: "invalid guard input" }] };
  }

  const issues = new Set<string>();
  const required = new Set<string>();
  if (input.required.length === 0) issues.add("no required guards");
  for (const name of input.required) {
    if (isGuardName(name)) required.add(name);
    else issues.add("invalid required guard name");
  }

  const answers = new Map<string, ReportedAnswer>();
  for (const answer of input.answers) {
    if (!isRecord(answer) || !isGuardName(answer.name)) {
      issues.add("invalid guard answer");
      continue;
    }

    const { name, ran, verdict, findings } = answer;
    const previous = answers.get(name);
    if (!previous) {
      answers.set(name, { ran, verdict, findings, conflicting: false });
    } else if (previous.ran !== ran || previous.verdict !== verdict || previous.findings !== findings) {
      previous.conflicting = true;
    }
  }

  let verdict: PrVerdictResult["verdict"] = issues.size ? "stop" : "merge";
  const reasons: GuardReason[] = [...issues].map((reason) => ({ reason }));
  const names = new Set([...required, ...answers.keys()]);
  for (const name of [...names].sort()) {
    const answer = answers.get(name);
    const findings = answer && isCount(answer.findings) ? Math.abs(answer.findings) : undefined;
    let problem: string | undefined;
    if (answer?.conflicting) problem = "conflicting answers";
    else if (!answer || (required.has(name) && answer.ran === false)) problem = "not run";
    else if (typeof answer.ran !== "boolean") problem = "invalid run status";
    else if (answer.verdict !== "ok" && answer.verdict !== "hold" && answer.verdict !== "stop") problem = "unknown verdict";
    else if (findings === undefined) problem = "invalid finding count";
    else if (answer.verdict === "ok" && findings > 0) problem = "ok with findings";

    if (problem) {
      verdict = "stop";
      const reason: GuardReason = { name, reason: problem };
      if (findings !== undefined && !answer?.conflicting) reason.findings = findings;
      reasons.push(reason);
    } else if (answer?.verdict === "stop") {
      verdict = "stop";
      reasons.push({ name, reason: "guard stopped", findings });
    } else if (answer?.verdict === "hold") {
      if (verdict === "merge") verdict = "hold";
      reasons.push({ name, reason: "hold for review", findings });
    } else if (required.has(name)) {
      reasons.push({ name, reason: "ok", findings });
    }
  }

  return { verdict, reasons };
}
