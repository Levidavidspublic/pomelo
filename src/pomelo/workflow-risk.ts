export const WORKFLOW_RISK_RULES = Object.freeze([
  "pull-request-target",
  "write-permissions",
  "ignored-check-failure",
  "unpinned-action",
  "pull-request-secret",
  "release-or-publish",
] as const);

export type WorkflowFinding = { file: string; line: number; rule: string; reason: string };
type Rule = (typeof WORKFLOW_RISK_RULES)[number];

type WorkflowLine = {
  line: number;
  indent: number;
  value: string;
  key?: string;
  item?: boolean;
  parent?: WorkflowLine;
};

const mapping = /^(?:([\w.-]+)|'([^']+)'|"([^"]+)"):(?:\s+|$)(.*)$/;
const blockScalar = /^[|>][1-9]?[+-]?$|^[|>][+-][1-9]$/;
const yamlComment = /"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|(?:^|\s)#.*$/g;
const shellText = /\$\{\{.*?\}\}|"(?:\\.|[^"\\])*"|'[^']*'|(?:^|\s)#.*$/g;

function uncomment(text: string): string {
  return text.replace(yamlComment, (part) => part.trimStart().startsWith("#") ? "" : part).trimEnd();
}

function unquote(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

// Track block indentation so shell lines and nested options cannot become workflow keys.
function* workflowLines(text: string): Generator<WorkflowLine> {
  const parents: WorkflowLine[] = [];
  for (const [index, raw] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const content = raw.trimStart();
    let indent = raw.length - content.length;
    const line = index + 1;
    if (!content || content.startsWith("#")) continue;

    let parent = parents.at(-1);
    const dash = /^-(?: +|$)/.exec(content);
    while (parent && parent.indent >= indent) {
      // YAML also permits sequences aligned with their owning key.
      if (dash && parent.indent === indent && !parent.value && (parent.key === "on" || parent.key === "steps")) break;
      parents.pop();
      parent = parents.at(-1);
    }
    if (parent && blockScalar.test(parent.value)) {
      yield { line, indent, parent, value: content.trimEnd() };
      continue;
    }

    let value = uncomment(content);
    if (dash) {
      value = value.slice(dash[0].length);
      const item = { line, indent, parent, item: true, value };
      parents.push(item);
      parent = item;
      indent += dash[0].length;
      if (!mapping.test(value)) {
        yield item;
        continue;
      }
    }

    const field = mapping.exec(value);
    const key = field?.[1] ?? field?.[2] ?? field?.[3];
    value = field?.[4] ?? value;
    const row = { line, indent, parent, key, value };
    if (key && (!value || blockScalar.test(value))) parents.push(row);
    yield row;
  }
}

// For inline event/permission collections, split at commas outside nested options and quotes.
function flowEntries(value: string): string[] {
  if (!/^(?:\[.*\]|\{.*\})$/.test(value)) return [value];
  const body = value.slice(1, -1);
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  for (const token of body.matchAll(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[\[\]{},]/g)) {
    if (token[0] === "[" || token[0] === "{") depth++;
    if (token[0] === "]" || token[0] === "}") depth--;
    if (token[0] === "," && depth === 0) {
      entries.push(body.slice(start, token.index).trim());
      start = token.index + 1;
    }
  }
  entries.push(body.slice(start).trim());
  return entries;
}

function eventsOn(row: WorkflowLine): string[] {
  if (row.key === "on" && !row.parent) {
    return flowEntries(row.value).map((entry) => {
      const field = mapping.exec(entry);
      return field?.[1] ?? field?.[2] ?? field?.[3] ?? unquote(entry);
    });
  }
  if (row.parent?.key === "on" && !row.parent.parent) {
    return [row.key ?? unquote(row.value)];
  }
  return [];
}

function isJobField(row: WorkflowLine): boolean {
  const jobs = row.parent?.parent;
  return jobs?.key === "jobs" && !jobs.parent;
}

function stepOf(row: WorkflowLine): WorkflowLine | undefined {
  const step = row.parent;
  const steps = step?.parent;
  if (step?.item && steps?.key === "steps" && isJobField(steps)) return step;
}

function secretNames(row: WorkflowLine): Set<string> {
  const expressions = Array.from(row.value.matchAll(/\$\{\{(.*?)\}\}/g), (match) => match[1]);
  if (row.key === "if" && expressions.length === 0) expressions.push(unquote(row.value));
  const names = new Set<string>();
  for (const expression of expressions) {
    const source = expression.replace(/'(?:''|[^'])*'/g, "''");
    for (const match of source.matchAll(/(?<![\w.])secrets\.([a-z_][a-z0-9_]*)/gi)) names.add(match[1]);
  }
  return names;
}

type CheckStep = { runsCheck: boolean; ignoredFailures: { line: number; reason: string }[] };

export function workflowRisk(file: string, text: string): WorkflowFinding[] {
  const findings: WorkflowFinding[] = [];
  const add = (line: number, rule: Rule, reason: string) => findings.push({ file, line, rule, reason });
  const rows = [...workflowLines(text)];
  let pullRequest = false;
  let pullRequestTarget = false;
  for (const row of rows) {
    const events = eventsOn(row);
    if (events.includes("pull_request")) pullRequest = true;
    if (events.includes("pull_request_target")) {
      pullRequestTarget = true;
      add(row.line, "pull-request-target", "This trigger runs in the context of the base repository.");
    }
  }

  const checks = new Map<WorkflowLine, CheckStep>();
  for (const row of rows) {
    const value = unquote(row.value);
    const workflowPermissions = row.key === "permissions" && !row.parent;
    if (row.key === "permissions" && (workflowPermissions || isJobField(row)) && value === "write-all") {
      add(row.line, "write-permissions", "This grants write access to all available permissions.");
    }
    if (pullRequest || pullRequestTarget) {
      const blockContentsWrite = row.key === "contents" && value === "write" &&
        row.parent?.key === "permissions" && !row.parent.parent;
      const inlineContentsWrite = workflowPermissions && value.startsWith("{") &&
        flowEntries(value).some((entry) => /^(?:contents|'contents'|"contents"):\s*(?:write|'write'|"write")$/.test(entry));
      if (blockContentsWrite || inlineContentsWrite) {
        add(row.line, "write-permissions", "This pull request workflow grants contents write access by default.");
      }
    }
    if (pullRequest) {
      for (const name of secretNames(row)) {
        add(row.line, "pull-request-secret", `Pull request workflow references secret ${name}.`);
      }
    }

    const runBlock = row.parent?.key === "run" && blockScalar.test(row.parent.value) ? row.parent : undefined;
    const step = stepOf(runBlock ?? row);
    if (row.key === "uses" && (step || isJobField(row)) && value &&
      !/^(?:actions\/|\.\/)/i.test(value) && !/@[a-f0-9]{40}$/i.test(value)) {
      add(row.line, "unpinned-action", "This external action or workflow is not pinned to a full commit SHA.");
    }
    if (!step) continue;

    const check = checks.get(step) ?? { runsCheck: false, ignoredFailures: [] };
    checks.set(step, check);
    if (row.key === "continue-on-error" && /^true$/i.test(row.value)) {
      check.ignoredFailures.push({ line: row.line, reason: "This test or typecheck step has continue-on-error enabled." });
    }
    if (!runBlock && (row.key !== "run" || blockScalar.test(row.value))) continue;

    const source = (runBlock ? row.value : value).replace(shellText, (part) => part.trimStart().startsWith("#") ? "" : "''");
    const commands = source.split(/[;&|()]/).map((command) => command.trim().replace(/^(?:(?:if|then|elif|else|do|!)\s+)+/, ""));
    if (commands.some((command) => /^npm\s+(?:test|run\s+(?:test|typecheck))(?:\s|$)/.test(command))) {
      check.runsCheck = true;
    }
    if (/\|\|\s*true(?=\s|$|[;&|)])/.test(source)) {
      check.ignoredFailures.push({ line: row.line, reason: "This test or typecheck step uses || true." });
    }
    if (commands.some((command) => /^(?:npm\s+publish|gh\s+release)(?:\s|$)/.test(command) ||
      /^(?:npx\s+)?electron-builder\s+(?:.*?\s)?--publish(?=\s|=|$)/.test(command))) {
      add(row.line, "release-or-publish", "This step runs a release or publish command.");
    }
  }

  for (const check of checks.values()) {
    if (!check.runsCheck) continue;
    for (const { line, reason } of check.ignoredFailures) add(line, "ignored-check-failure", reason);
  }
  return findings.sort((a, b) => a.line - b.line);
}
