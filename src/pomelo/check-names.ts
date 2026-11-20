export interface CheckNameWorkflow {
  path: string;
  text: string | null | undefined;
}

export interface CheckNameJob {
  path: string;
  id: string;
  name: string;
  onPullRequest: boolean;
  matrix: boolean;
}

export interface MissingCheckName {
  name: string;
  reason: string;
}

export interface CheckNamesResult {
  ok: boolean;
  missing: MissingCheckName[];
  jobs: CheckNameJob[];
}

interface WorkflowLine {
  indent: number;
  section?: "on" | "jobs";
  job?: CheckNameJob;
  strategy?: CheckNameJob;
}

const mapping = /^(?:([\w.-]+)|'([^']+)'|"([^"]+)"):(?:\s+|$)(.*)$/;
const yamlComment = /"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|(?:^|\s)#.*$/g;

function unquote(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

function hasPullRequestEvent(value: string): boolean {
  if (!value.startsWith("[") || !value.endsWith("]")) return unquote(value) === "pull_request";
  return value.slice(1, -1).split(",").some((event) => unquote(event.trim()) === "pull_request");
}

function readJobs({ path, text }: CheckNameWorkflow): CheckNameJob[] {
  if (typeof text !== "string") return [];

  const jobs: CheckNameJob[] = [];
  const parents: WorkflowLine[] = [];
  let onPullRequest = false;

  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const content = raw.trimStart();
    const line = content.replace(yamlComment, (part) => part.trimStart().startsWith("#") ? "" : part).trimEnd();
    if (!line) continue;

    const indent = raw.length - content.length;
    const eventItem = /^-\s+(.+)$/.exec(line);
    let parent = parents.at(-1);
    // A block list of triggers may also align with its owning `on:` key.
    while (parent && parent.indent >= indent) {
      if (eventItem && parent.section === "on") break;
      parents.pop();
      parent = parents.at(-1);
    }
    const field = mapping.exec(line);
    const key = field?.[1] ?? field?.[2] ?? field?.[3];
    const value = field?.[4] ?? "";

    // Keep other lines in the stack so nested keys can't become job fields or triggers.
    const row: WorkflowLine = { indent };
    parents.push(row);
    if (indent === 0 && key === "on") {
      if (value) onPullRequest ||= hasPullRequestEvent(value);
      else row.section = "on";
    } else if (indent === 0 && key === "jobs" && !value) {
      row.section = "jobs";
    } else if (parent?.section === "on") {
      onPullRequest ||= (key ?? unquote(eventItem?.[1] ?? "")) === "pull_request";
    } else if (parent?.section === "jobs" && key && (!value || value === "{}")) {
      row.job = { path, id: key, name: key, onPullRequest: false, matrix: false };
      jobs.push(row.job);
    } else if (parent?.job && key === "name" && value) {
      parent.job.name = unquote(value) || parent.job.id;
    } else if (parent?.job && key === "strategy" && !value) {
      row.strategy = parent.job;
    } else if (parent?.strategy && key === "matrix") {
      parent.strategy.matrix = true;
    }
  }

  return jobs.map((job) => ({ ...job, onPullRequest }));
}

/** Compare required names with the jobs declared in the supplied workflow text. */
export function checkRequiredNames(
  required: readonly string[],
  workflows: readonly CheckNameWorkflow[],
): CheckNamesResult {
  const jobs = workflows.flatMap(readJobs);
  const missing: MissingCheckName[] = [];
  for (const name of required) {
    const matches = jobs.filter((job) => name === job.name || (job.matrix && name.startsWith(`${job.name} (`)));
    if (matches.some((job) => job.onPullRequest)) continue;

    const job = matches[0];
    const reason = job
      ? `Job '${job.name}' is in ${job.path}, which does not run on pull requests`
      : `No job is named '${name}'`;
    missing.push({ name, reason });
  }
  return { ok: missing.length === 0, missing, jobs };
}
