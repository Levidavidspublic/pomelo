interface CommitAuthorFinding {
  commit: string;
  side: "author" | "committer" | "both";
  domain: string;
  reason: string;
}

const fullHash = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const emailWithDomain = /^[^@\s<>\p{Cc}]+@([^@\s<>\p{Cc}]+)$/u;

/** Check the tab-separated output of git log --format=%H%x09%an%x09%ae%x09%cn%x09%ce. */
export function commitAuthorCheck(logText: string, allowed: readonly string[]): {
  ok: boolean;
  checked: number;
  findings: CommitAuthorFinding[];
  problems: string[];
} {
  const patterns = new Set(allowed.map((pattern) => pattern.toLowerCase()));
  const findings: CommitAuthorFinding[] = [];
  const problems: string[] = [];
  const lines = logText.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (!lines.some((line) => line !== "")) problems.push("nothing to check");
  if (patterns.size === 0) problems.push("The allowed email list is empty.");

  let checked = 0;
  for (const [index, line] of lines.entries()) {
    const fields = line.split("\t");
    const [hash, , authorEmail, , committerEmail] = fields;
    if (fields.length !== 5 || !fullHash.test(hash)) {
      problems.push(`Line ${index + 1} is not a valid git log row.`);
      continue;
    }

    checked++;
    const commit = hash.slice(0, 7);
    const rejected: { side: "author" | "committer"; domain: string }[] = [];
    for (const [side, rawEmail] of [["author", authorEmail], ["committer", committerEmail]] as const) {
      const email = rawEmail.toLowerCase();
      const domain = emailWithDomain.exec(email)?.[1];
      if (!domain) {
        const problem = rawEmail.trim() === "" ? "empty" : "invalid";
        problems.push(`Commit ${commit} has a ${side} email that is ${problem}.`);
      } else if (!patterns.has(email) && !patterns.has(`*@${domain}`)) {
        rejected.push({ side, domain });
      }
    }

    const [first, second] = rejected;
    if (!first) continue;
    findings.push({
      commit,
      side: second ? "both" : first.side,
      domain: [...new Set(rejected.map(({ domain }) => domain))].join(", "),
      reason: second
        ? "Neither the author nor the committer email is allowed."
        : `The ${first.side} email is not allowed.`,
    });
  }

  return { ok: findings.length === 0 && problems.length === 0, checked, findings, problems };
}
