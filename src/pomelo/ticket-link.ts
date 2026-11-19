export function checkTicketLink({ branch, title, body }: { branch: string; title: string; body: string }): {
  ok: boolean;
  issue: number | null;
  key: string | null;
  problems: string[];
} {
  const problems: string[] = [];
  const branchMatch = /^ticket\/(\d+)-(p\d+-\d+)$/.exec(branch);
  const issue = branchMatch ? Number(branchMatch[1]) : null;
  const key = branchMatch ? branchMatch[2].toUpperCase() : null;
  if (!branchMatch) {
    problems.push("The branch must use the format ticket/<issue>-p<phase>-<ticket>.");
  }

  const titleKey = /^(P\d+-\d+)\b/.exec(title)?.[1];
  if (!titleKey) {
    problems.push("The title must start with an uppercase ticket key such as P0-13.");
  } else if (key !== null && titleKey !== key) {
    problems.push(`The title must start with ${key} to match the branch.`);
  }

  const closingReferences = [...body.matchAll(/\b(?:closes|fixes|resolves)[ \t]+#(\d+)\b/gi)];
  if (closingReferences.length > 1) {
    problems.push("The body must contain exactly one closing reference.");
  } else if (!/^[ \t]*(?:closes|fixes|resolves)[ \t]+#\d+[ \t]*$/im.test(body)) {
    problems.push(`The body must contain a closing line such as Closes #${issue ?? 75}.`);
  } else if (branchMatch && BigInt(closingReferences[0][1]) !== BigInt(branchMatch[1])) {
    problems.push(`The body must close issue #${branchMatch[1]} to match the branch.`);
  }

  return { ok: problems.length === 0, issue, key, problems };
}
